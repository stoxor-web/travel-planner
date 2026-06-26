(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const COLLECTION = 'travelPlannerUsers';
  const COMMUNITY_COLLECTION = 'communityTrips';
  const ADMIN_EMAIL = 'lucas.scribe01@gmail.com';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let modules = null;
  let currentUser = null;
  let currentStatus = 'Firebase non initialisé.';
  let initializingPromise = null;
  let firstAuthResolved = false;
  const authListeners = new Set();
  const authWaiters = [];

  function cleanConfig(config = {}) {
    return {
      apiKey: String(config.apiKey || '').trim(),
      authDomain: String(config.authDomain || '').trim(),
      projectId: String(config.projectId || '').trim(),
      appId: String(config.appId || '').trim(),
      storageBucket: String(config.storageBucket || '').trim(),
      messagingSenderId: String(config.messagingSenderId || '').trim(),
      measurementId: String(config.measurementId || '').trim()
    };
  }

  function getConfig() { return cleanConfig(window.TRAVEL_PLANNER_FIREBASE_CONFIG || {}); }
  function isConfigured(config = getConfig()) { return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId); }

  async function loadModules() {
    if (modules) return modules;
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]);
    modules = { appModule, authModule, firestoreModule };
    return modules;
  }

  function notifyAuthListeners() {
    const payload = { user: currentUser, status: currentStatus, configured: isConfigured(), isAdmin: isAdmin() };
    authListeners.forEach(listener => {
      try { listener(payload); } catch (error) { console.error(error); }
    });
  }

  function resolveAuthWaiters() {
    firstAuthResolved = true;
    while (authWaiters.length) authWaiters.shift()(currentUser);
  }

  async function init() {
    if (firebaseAuth && firestoreDb) return { auth: firebaseAuth, db: firestoreDb, user: currentUser };
    if (initializingPromise) return initializingPromise;
    initializingPromise = (async () => {
      const config = getConfig();
      if (!isConfigured(config)) {
        currentStatus = 'Configuration Firebase incomplète.';
        notifyAuthListeners();
        throw new Error(currentStatus);
      }
      const { appModule, authModule, firestoreModule } = await loadModules();
      firebaseApp = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
      firebaseAuth = authModule.getAuth(firebaseApp);
      firestoreDb = firestoreModule.getFirestore(firebaseApp);
      try { await authModule.setPersistence(firebaseAuth, authModule.browserLocalPersistence); } catch (error) { console.warn(error); }
      authModule.onAuthStateChanged(firebaseAuth, user => {
        currentUser = user;
        currentStatus = user ? `Connecté avec ${user.email || 'Google'}.` : 'Connexion Google requise.';
        resolveAuthWaiters();
        notifyAuthListeners();
      });
      currentStatus = 'Firebase prêt.';
      notifyAuthListeners();
      return { auth: firebaseAuth, db: firestoreDb, user: currentUser };
    })();
    try { return await initializingPromise; } catch (error) { initializingPromise = null; throw error; }
  }

  async function waitForAuthState(timeoutMs = 8000) {
    await init();
    if (firstAuthResolved) return currentUser;
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(currentUser), timeoutMs);
      authWaiters.push(user => { clearTimeout(timer); resolve(user); });
    });
  }

  async function signIn() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const provider = new authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await authModule.signInWithPopup(auth, provider);
      currentUser = result.user;
      currentStatus = `Connecté avec ${currentUser.email || 'Google'}.`;
      notifyAuthListeners();
      return currentUser;
    } catch (error) {
      if (['auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error.code)) {
        await authModule.signInWithRedirect(auth, provider);
        return null;
      }
      throw error;
    }
  }

  async function signOut() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    await authModule.signOut(auth);
    currentUser = null;
    currentStatus = 'Déconnecté.';
    notifyAuthListeners();
  }

  function requireSignedIn() {
    if (!currentUser) throw new Error('Connecte-toi avec Google.');
    if (!firestoreDb || !modules) throw new Error('Firebase n’est pas prêt.');
  }

  function cloudDocRef() {
    const { firestoreModule } = modules;
    return firestoreModule.doc(firestoreDb, COLLECTION, currentUser.uid);
  }

  function sanitizeStateForCloud(state) {
    return JSON.parse(JSON.stringify({
      version: state?.version || 2,
      activeTripId: state?.activeTripId || state?.trips?.[0]?.id || null,
      settings: state?.settings || {},
      trips: Array.isArray(state?.trips) ? state.trips : []
    }));
  }

  async function saveState(state) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      schema: 'travelPlannerState',
      schemaVersion: 1,
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: firestoreModule.serverTimestamp(),
      state: sanitizeStateForCloud(state)
    };
    await firestoreModule.setDoc(cloudDocRef(), payload, { merge: true });
    currentStatus = 'Sauvegardé.';
    notifyAuthListeners();
    return payload;
  }

  async function loadState() {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const snapshot = await firestoreModule.getDoc(cloudDocRef());
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    currentStatus = 'Voyages chargés.';
    notifyAuthListeners();
    return { state: data.state || null, clientUpdatedAt: data.clientUpdatedAt || '', ownerEmail: data.ownerEmail || '' };
  }

  async function deleteState() {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(cloudDocRef());
    currentStatus = 'Données supprimées.';
    notifyAuthListeners();
  }

  function publicTripData(trip, options = {}) {
    const cleaned = JSON.parse(JSON.stringify(trip || {}));
    if (options.hideNotes) {
      cleaned.description = cleaned.description ? cleaned.description : '';
      cleaned.steps = (cleaned.steps || []).map(step => ({ ...step, notes: '', links: [], journal: {} }));
      cleaned.checklists = {};
    }
    if (options.hideBudget) {
      cleaned.maxBudget = 0;
      cleaned.expenses = [];
      cleaned.steps = (cleaned.steps || []).map(step => ({ ...step, cost: 0, segmentCost: 0 }));
    }
    return cleaned;
  }

  async function publishCommunityTrip(trip, meta = {}) {
    await init();
    requireSignedIn();
    if (!trip?.id) throw new Error('Aucun voyage actif à publier.');
    const { firestoreModule } = await loadModules();
    const id = `${currentUser.uid}_${trip.id}`;
    const docRef = firestoreModule.doc(firestoreDb, COMMUNITY_COLLECTION, id);
    const payload = {
      id,
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      ownerName: currentUser.displayName || currentUser.email || 'Utilisateur',
      title: meta.title || trip.name || 'Voyage partagé',
      country: meta.country || trip.area || '',
      category: meta.category || 'roadtrip',
      coverImage: meta.coverImage || trip.coverImage || '',
      description: meta.description || trip.description || '',
      hideBudget: Boolean(meta.hideBudget),
      hideNotes: Boolean(meta.hideNotes),
      allowCopy: meta.allowCopy !== false,
      createdAt: firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp(),
      clientUpdatedAt: new Date().toISOString(),
      votes: {},
      score: 0,
      trip: publicTripData(trip, meta)
    };
    await firestoreModule.setDoc(docRef, payload, { merge: true });
    return payload;
  }

  async function listCommunityTrips() {
    await init();
    const { firestoreModule } = await loadModules();
    const snapshot = await firestoreModule.getDocs(firestoreModule.collection(firestoreDb, COMMUNITY_COLLECTION));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function voteCommunityTrip(id, value) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const docRef = firestoreModule.doc(firestoreDb, COMMUNITY_COLLECTION, id);
    const snapshot = await firestoreModule.getDoc(docRef);
    if (!snapshot.exists()) throw new Error('Publication introuvable.');
    const data = snapshot.data();
    const votes = { ...(data.votes || {}), [currentUser.uid]: value > 0 ? 1 : -1 };
    const score = Object.values(votes).reduce((sum, item) => sum + Number(item || 0), 0);
    await firestoreModule.updateDoc(docRef, { votes, score, updatedAt: firestoreModule.serverTimestamp() });
  }

  async function deleteCommunityTrip(id) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(firestoreModule.doc(firestoreDb, COMMUNITY_COLLECTION, id));
  }

  function onAuthChange(listener) {
    authListeners.add(listener);
    listener({ user: currentUser, status: currentStatus, configured: isConfigured(), isAdmin: isAdmin() });
    return () => authListeners.delete(listener);
  }

  function getUser() { return currentUser; }
  function getStatus() { return currentStatus; }
  function isAdmin() { return (currentUser?.email || '').toLowerCase() === ADMIN_EMAIL; }

  window.TravelCloudSync = {
    getConfig,
    isConfigured,
    init,
    waitForAuthState,
    signIn,
    signOut,
    saveState,
    loadState,
    deleteState,
    getUser,
    getStatus,
    onAuthChange,
    isAdmin,
    publishCommunityTrip,
    listCommunityTrips,
    voteCommunityTrip,
    deleteCommunityTrip
  };
})();
