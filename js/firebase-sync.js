(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const USER_COLLECTION = 'travelPlannerUsers';
  const COMMUNITY_COLLECTION = 'communityTrips';
  const ADMIN_EMAIL = 'lucas.scribe01@gmail.com';

  let app = null;
  let auth = null;
  let db = null;
  let modules = null;
  let currentUser = null;
  let initPromise = null;
  let status = 'Firebase non initialisé.';
  const listeners = new Set();

  function cleanConfig(config = {}) {
    return {
      apiKey: String(config.apiKey || '').trim(),
      authDomain: String(config.authDomain || '').trim(),
      projectId: String(config.projectId || '').trim(),
      storageBucket: String(config.storageBucket || '').trim(),
      messagingSenderId: String(config.messagingSenderId || '').trim(),
      appId: String(config.appId || '').trim(),
      measurementId: String(config.measurementId || '').trim()
    };
  }

  function getConfig() { return cleanConfig(window.TRAVEL_PLANNER_FIREBASE_CONFIG || {}); }
  function isConfigured() {
    const c = getConfig();
    return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
  }

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

  async function init() {
    if (auth && db) return { auth, db, user: currentUser };
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!isConfigured()) throw new Error('Configuration Firebase manquante.');
      const { appModule, authModule, firestoreModule } = await loadModules();
      app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(getConfig());
      auth = authModule.getAuth(app);
      db = firestoreModule.getFirestore(app);
      try { await authModule.setPersistence(auth, authModule.browserLocalPersistence); } catch (e) { console.warn(e); }
      authModule.onAuthStateChanged(auth, user => {
        currentUser = user;
        status = user ? `Connecté avec ${displayName(user)}.` : 'Choisis un mode de connexion.';
        notify();
      });
      status = 'Firebase prêt.';
      notify();
      return { auth, db, user: currentUser };
    })();
    try { return await initPromise; } catch (e) { initPromise = null; status = e.message; notify(); throw e; }
  }

  function displayName(user = currentUser) {
    if (!user) return 'invité';
    if (user.isAnonymous) return 'un accès invité';
    return user.displayName || user.email || 'un compte';
  }

  async function signInGoogle() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const provider = new authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await authModule.signInWithPopup(auth, provider);
      currentUser = result.user;
      notify();
      return currentUser;
    } catch (error) {
      if (['auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error.code)) {
        await authModule.signInWithRedirect(auth, provider);
        return null;
      }
      throw error;
    }
  }

  async function signInEmail(email, password) {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const result = await authModule.signInWithEmailAndPassword(auth, email, password);
    currentUser = result.user;
    notify();
    return currentUser;
  }

  async function registerEmail(email, password) {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const result = await authModule.createUserWithEmailAndPassword(auth, email, password);
    currentUser = result.user;
    notify();
    return currentUser;
  }

  async function resetPassword(email) {
    const { auth } = await init();
    const { authModule } = await loadModules();
    await authModule.sendPasswordResetEmail(auth, email);
  }

  async function signInAnonymous() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const result = await authModule.signInAnonymously(auth);
    currentUser = result.user;
    notify();
    return currentUser;
  }

  async function signOut() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    await authModule.signOut(auth);
    currentUser = null;
    notify();
  }

  function requireUser() {
    if (!currentUser) throw new Error('Connecte-toi avant de synchroniser.');
    if (!db) throw new Error('Firestore non initialisé.');
  }

  async function saveState(state) {
    await init();
    requireUser();
    const { firestoreModule } = await loadModules();
    const ref = firestoreModule.doc(db, USER_COLLECTION, currentUser.uid);
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      schema: 'travelPlannerState',
      schemaVersion: 1,
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: firestoreModule.serverTimestamp(),
      state: JSON.parse(JSON.stringify(state || {}))
    };
    await firestoreModule.setDoc(ref, payload, { merge: true });
    status = 'Sauvegardé.';
    notify();
    return payload;
  }

  async function loadState() {
    await init();
    requireUser();
    const { firestoreModule } = await loadModules();
    const ref = firestoreModule.doc(db, USER_COLLECTION, currentUser.uid);
    const snap = await firestoreModule.getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    status = 'Voyages chargés.';
    notify();
    return { state: data.state || null, clientUpdatedAt: data.clientUpdatedAt || '' };
  }

  async function deleteState() {
    await init();
    requireUser();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(firestoreModule.doc(db, USER_COLLECTION, currentUser.uid));
  }

  function publicTripPayload(trip, options = {}) {
    const cleanTrip = JSON.parse(JSON.stringify(trip || {}));
    if (options.hideBudget) {
      cleanTrip.maxBudget = 0;
      cleanTrip.expenses = [];
      cleanTrip.steps = (cleanTrip.steps || []).map(s => ({ ...s, cost: 0, segmentCost: 0, notes: options.hideNotes ? '' : s.notes }));
    }
    if (options.hideNotes) {
      cleanTrip.description = '';
      cleanTrip.steps = (cleanTrip.steps || []).map(s => ({ ...s, notes: '', journal: {} }));
    }
    return cleanTrip;
  }

  async function publishCommunityTrip(trip, options = {}) {
    await init();
    requireUser();
    const { firestoreModule } = await loadModules();
    const ref = firestoreModule.doc(firestoreModule.collection(db, COMMUNITY_COLLECTION));
    const doc = {
      id: ref.id,
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      ownerName: currentUser.displayName || currentUser.email || (currentUser.isAnonymous ? 'Invité' : 'Utilisateur'),
      title: options.title || trip.name || 'Voyage partagé',
      country: options.country || trip.area || '',
      category: options.category || 'roadtrip',
      coverImage: options.coverImage || trip.coverImage || '',
      description: options.description || trip.description || '',
      allowCopy: options.allowCopy !== false,
      hideBudget: Boolean(options.hideBudget),
      trip: publicTripPayload(trip, options),
      votes: {},
      score: 0,
      createdAt: firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp()
    };
    await firestoreModule.setDoc(ref, doc);
    return doc;
  }

  async function listCommunityTrips() {
    await init();
    const { firestoreModule } = await loadModules();
    const q = firestoreModule.query(firestoreModule.collection(db, COMMUNITY_COLLECTION), firestoreModule.orderBy('score', 'desc'), firestoreModule.limit(80));
    const snap = await firestoreModule.getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function voteCommunityTrip(id, value) {
    await init();
    requireUser();
    const { firestoreModule } = await loadModules();
    const ref = firestoreModule.doc(db, COMMUNITY_COLLECTION, id);
    const snap = await firestoreModule.getDoc(ref);
    if (!snap.exists()) throw new Error('Voyage introuvable.');
    const data = snap.data();
    const votes = data.votes || {};
    votes[currentUser.uid] = Number(value) > 0 ? 1 : -1;
    const score = Object.values(votes).reduce((sum, v) => sum + Number(v || 0), 0);
    await firestoreModule.updateDoc(ref, { votes, score, updatedAt: firestoreModule.serverTimestamp() });
  }

  async function deleteCommunityTrip(id) {
    await init();
    requireUser();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(firestoreModule.doc(db, COMMUNITY_COLLECTION, id));
  }

  function isAdmin() { return currentUser?.email === ADMIN_EMAIL; }
  function getUser() { return currentUser; }
  function getStatus() { return status; }

  function onAuthChange(listener) {
    listeners.add(listener);
    listener({ user: currentUser, status, configured: isConfigured() });
    return () => listeners.delete(listener);
  }
  function notify() { listeners.forEach(fn => fn({ user: currentUser, status, configured: isConfigured() })); }

  window.TravelCloudSync = {
    init, isConfigured, getConfig, getUser, getStatus, isAdmin, onAuthChange,
    signIn: signInGoogle, signInGoogle, signInEmail, registerEmail, resetPassword, signInAnonymous, signOut,
    saveState, loadState, deleteState,
    publishCommunityTrip, listCommunityTrips, voteCommunityTrip, deleteCommunityTrip
  };
})();
