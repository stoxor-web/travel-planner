(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const COLLECTION = 'travelPlannerUsers';
  const COMMUNITY = 'communityTrips';
  const SHARES = 'sharedTrips';
  const ADMIN_EMAIL = 'lucas.scribe01@gmail.com';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let modules = null;
  let currentUser = null;
  let status = 'Firebase non initialisé.';
  let initPromise = null;
  let authReadyResolve;
  let authReady = new Promise(resolve => { authReadyResolve = resolve; });
  const listeners = new Set();

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
  function isConfigured() { const c = getConfig(); return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId); }
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
  function notify(extra = {}) { listeners.forEach(fn => fn({ user: currentUser, status, configured: isConfigured(), ...extra })); }

  async function init() {
    if (firebaseAuth && firestoreDb) return { auth: firebaseAuth, db: firestoreDb };
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!isConfigured()) throw new Error('Firebase n’est pas configuré.');
      const { appModule, authModule, firestoreModule } = await loadModules();
      firebaseApp = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(getConfig());
      firebaseAuth = authModule.getAuth(firebaseApp);
      firestoreDb = firestoreModule.getFirestore(firebaseApp);
      try { await authModule.setPersistence(firebaseAuth, authModule.browserLocalPersistence); } catch (e) { console.warn(e); }
      authModule.onAuthStateChanged(firebaseAuth, user => {
        currentUser = user;
        status = user ? `Connecté avec ${user.email || user.displayName || 'Google'}.` : 'Connexion Google requise.';
        notify();
        authReadyResolve?.(user);
        authReadyResolve = null;
      });
      status = 'Firebase prêt.';
      notify();
      return { auth: firebaseAuth, db: firestoreDb };
    })();
    return initPromise;
  }

  async function waitForAuthState() { await init(); return authReady; }
  async function signIn() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const provider = new authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await authModule.signInWithPopup(auth, provider);
      currentUser = result.user;
      status = `Connecté avec ${currentUser.email || 'Google'}.`;
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
  async function signOut() { const { auth } = await init(); const { authModule } = await loadModules(); await authModule.signOut(auth); }
  function requireUser() { if (!currentUser) throw new Error('Connexion Google requise.'); }
  async function saveState(state) {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      schema: 'travelPlannerState',
      schemaVersion: 12,
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: firestoreModule.serverTimestamp(),
      state: JSON.parse(JSON.stringify(state || {}))
    };
    await firestoreModule.setDoc(firestoreModule.doc(firestoreDb, COLLECTION, currentUser.uid), payload, { merge: false });
    status = 'Sauvegardé.';
    notify();
    return payload;
  }
  async function loadState() {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    const snap = await firestoreModule.getDoc(firestoreModule.doc(firestoreDb, COLLECTION, currentUser.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { state: data.state || null, clientUpdatedAt: data.clientUpdatedAt || '' };
  }
  async function deleteState() {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(firestoreModule.doc(firestoreDb, COLLECTION, currentUser.uid));
    status = 'Données supprimées.'; notify();
  }

  function publicTripPayload(trip, options = {}) {
    const hideBudget = Boolean(options.hideBudget);
    const hideNotes = Boolean(options.hideNotes);
    const clone = JSON.parse(JSON.stringify(trip || {}));
    if (hideBudget) { clone.maxBudget = 0; clone.expenses = []; clone.steps = (clone.steps || []).map(s => ({ ...s, cost: 0, segmentCost: 0 })); }
    if (hideNotes) { clone.description = ''; clone.steps = (clone.steps || []).map(s => ({ ...s, notes: '', segmentNote: '', links: [] })); }
    return clone;
  }

  async function createPublicShare(trip, options = {}) {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    const docRef = firestoreModule.doc(firestoreModule.collection(firestoreDb, SHARES));
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      title: trip?.name || 'Voyage partagé',
      trip: publicTripPayload(trip, options),
      visibility: 'public',
      createdAt: firestoreModule.serverTimestamp(),
      clientCreatedAt: new Date().toISOString()
    };
    await firestoreModule.setDoc(docRef, payload);
    return `${location.origin}${location.pathname}#share/${docRef.id}`;
  }

  async function createPrivateShare(trip, emails = [], options = {}) {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    const docRef = firestoreModule.doc(firestoreModule.collection(firestoreDb, SHARES));
    const allowed = emails.map(e => String(e).trim().toLowerCase()).filter(Boolean);
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      allowedEmails: allowed,
      title: trip?.name || 'Voyage partagé',
      trip: publicTripPayload(trip, options),
      visibility: 'private',
      createdAt: firestoreModule.serverTimestamp(),
      clientCreatedAt: new Date().toISOString()
    };
    await firestoreModule.setDoc(docRef, payload);
    return `${location.origin}${location.pathname}#share/${docRef.id}`;
  }

  async function publishCommunityTrip(trip, options = {}) {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    const docRef = firestoreModule.doc(firestoreModule.collection(firestoreDb, COMMUNITY));
    const publicTrip = publicTripPayload(trip, { hideBudget: options.hideBudget, hideNotes: options.hideNotes });
    const payload = {
      id: docRef.id,
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      authorName: currentUser.displayName || currentUser.email || 'Utilisateur',
      title: options.title || trip?.name || 'Voyage partagé',
      country: options.country || trip?.area || '',
      category: options.category || 'roadtrip',
      coverImage: options.coverImage || trip?.coverImage || '',
      description: options.description || trip?.description || '',
      hideBudget: Boolean(options.hideBudget),
      hideNotes: Boolean(options.hideNotes),
      allowCopy: options.allowCopy !== false,
      votesUp: 0,
      votesDown: 0,
      voters: {},
      trip: publicTrip,
      createdAt: firestoreModule.serverTimestamp(),
      clientCreatedAt: new Date().toISOString()
    };
    await firestoreModule.setDoc(docRef, payload);
    return payload;
  }

  async function listCommunityTrips() {
    await init();
    const { firestoreModule } = await loadModules();
    const q = firestoreModule.query(firestoreModule.collection(firestoreDb, COMMUNITY), firestoreModule.limit(80));
    const snap = await firestoreModule.getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function voteCommunityTrip(id, direction = 'up') {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    const ref = firestoreModule.doc(firestoreDb, COMMUNITY, id);
    const snap = await firestoreModule.getDoc(ref);
    if (!snap.exists()) throw new Error('Voyage communautaire introuvable.');
    const data = snap.data();
    const voters = data.voters || {};
    const previous = voters[currentUser.uid];
    let up = Number(data.votesUp) || 0;
    let down = Number(data.votesDown) || 0;
    if (previous === 'up') up = Math.max(0, up - 1);
    if (previous === 'down') down = Math.max(0, down - 1);
    if (direction === 'up') up += 1; else down += 1;
    voters[currentUser.uid] = direction;
    await firestoreModule.updateDoc(ref, { votesUp: up, votesDown: down, voters, clientUpdatedAt: new Date().toISOString() });
  }

  async function deleteCommunityTrip(id) {
    await init(); requireUser();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(firestoreModule.doc(firestoreDb, COMMUNITY, id));
  }

  function isAdmin() { return (currentUser?.email || '').toLowerCase() === ADMIN_EMAIL; }
  function getUser() { return currentUser; }
  function getStatus() { return status; }
  function onAuthChange(fn) { listeners.add(fn); fn({ user: currentUser, status, configured: isConfigured() }); return () => listeners.delete(fn); }

  window.TravelCloudSync = {
    getConfig, isConfigured, init, waitForAuthState, signIn, signOut, saveState, loadState, deleteState,
    getUser, getStatus, onAuthChange, createPublicShare, createPrivateShare,
    publishCommunityTrip, listCommunityTrips, voteCommunityTrip, deleteCommunityTrip, isAdmin
  };
})();
