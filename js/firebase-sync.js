(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const COLLECTION = 'travelPlannerUsers';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let modules = null;
  let currentUser = null;
  let currentStatus = 'Firebase non configuré.';
  let initializingPromise = null;
  let authReadyPromise = null;
  let authReadyResolve = null;
  let authUnsubscribe = null;
  const authListeners = new Set();

  function cleanConfig(config = {}) {
    return {
      apiKey: String(config.apiKey || '').trim(),
      authDomain: String(config.authDomain || '').trim(),
      projectId: String(config.projectId || '').trim(),
      appId: String(config.appId || '').trim(),
      storageBucket: String(config.storageBucket || '').trim(),
      messagingSenderId: String(config.messagingSenderId || '').trim()
    };
  }

  function getConfig() {
    return cleanConfig(window.TRAVEL_PLANNER_FIREBASE_CONFIG || {});
  }

  function isConfigured(config = getConfig()) {
    return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
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
    if (firebaseAuth && firestoreDb) return { auth: firebaseAuth, db: firestoreDb, user: currentUser };
    if (initializingPromise) return initializingPromise;

    initializingPromise = (async () => {
      const config = getConfig();
      if (!isConfigured(config)) {
        currentStatus = 'Firebase n’est pas configuré dans js/firebase-config.js.';
        notifyAuthListeners();
        throw new Error(currentStatus);
      }

      const { appModule, authModule, firestoreModule } = await loadModules();
      firebaseApp = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
      firebaseAuth = authModule.getAuth(firebaseApp);
      firestoreDb = firestoreModule.getFirestore(firebaseApp);

      try {
        await authModule.setPersistence(firebaseAuth, authModule.browserLocalPersistence);
      } catch (error) {
        console.warn('Persistance Firebase Auth non modifiée.', error);
      }

      if (!authReadyPromise) {
        authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });
      }

      if (authUnsubscribe) authUnsubscribe();
      authUnsubscribe = authModule.onAuthStateChanged(firebaseAuth, user => {
        currentUser = user || null;
        currentStatus = currentUser
          ? `Connecté avec ${currentUser.email || currentUser.displayName || 'Google'}.`
          : 'Connexion Google requise pour accéder aux voyages.';
        notifyAuthListeners();
        if (authReadyResolve) {
          authReadyResolve(currentUser);
          authReadyResolve = null;
        }
      });

      currentStatus = 'Firebase initialisé.';
      notifyAuthListeners();
      return { auth: firebaseAuth, db: firestoreDb, user: currentUser };
    })();

    try {
      return await initializingPromise;
    } catch (error) {
      initializingPromise = null;
      throw error;
    }
  }

  async function waitForAuthState() {
    await init();
    if (currentUser !== null) return currentUser;
    if (!authReadyPromise) authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });
    return authReadyPromise;
  }

  async function signIn() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const provider = new authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await authModule.signInWithPopup(auth, provider);
      currentUser = result.user;
      currentStatus = `Connecté avec ${currentUser.email || currentUser.displayName || 'Google'}.`;
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
    currentStatus = 'Déconnecté de Google.';
    notifyAuthListeners();
  }

  function requireSignedIn() {
    if (!currentUser) throw new Error('Connecte-toi avec Google pour accéder à tes voyages.');
    if (!firestoreDb) throw new Error('Firebase n’est pas initialisé.');
  }

  function cloudDocRef() {
    const { firestoreModule } = modules;
    return firestoreModule.doc(firestoreDb, COLLECTION, currentUser.uid);
  }

  function sanitizeStateForCloud(state) {
    return JSON.parse(JSON.stringify({
      version: state.version || 1,
      activeTripId: state.activeTripId || state.trips?.[0]?.id || null,
      settings: state.settings || {},
      trips: Array.isArray(state.trips) ? state.trips : []
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
    await firestoreModule.setDoc(cloudDocRef(), payload, { merge: false });
    currentStatus = `Sauvegardé dans Firebase pour ${currentUser.email || 'ce compte Google'}.`;
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
    currentStatus = `Voyages chargés depuis Firebase pour ${currentUser.email || 'ce compte Google'}.`;
    notifyAuthListeners();
    return {
      state: data.state || null,
      clientUpdatedAt: data.clientUpdatedAt || '',
      ownerEmail: data.ownerEmail || '',
      schemaVersion: data.schemaVersion || 1
    };
  }

  async function deleteState() {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(cloudDocRef());
    currentStatus = 'Données Firebase supprimées pour ce compte Google.';
    notifyAuthListeners();
  }

  function onAuthChange(listener) {
    authListeners.add(listener);
    listener({ user: currentUser, status: currentStatus, configured: isConfigured() });
    return () => authListeners.delete(listener);
  }

  function notifyAuthListeners() {
    const payload = { user: currentUser, status: currentStatus, configured: isConfigured() };
    authListeners.forEach(listener => listener(payload));
  }

  function getUser() {
    return currentUser;
  }

  function getStatus() {
    return currentStatus;
  }

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
    onAuthChange
  };
})();
