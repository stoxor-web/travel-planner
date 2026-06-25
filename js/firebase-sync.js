(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const COLLECTION = 'travelPlannerUsers';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let analyticsInstance = null;
  let modules = null;
  let currentUser = null;
  let authReady = false;
  let currentStatus = 'Connexion Google requise.';
  let initializingPromise = null;
  let authReadyPromise = null;
  const authListeners = new Set();

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

  function getConfig() {
    return cleanConfig(window.TRAVEL_PLANNER_FIREBASE_CONFIG || {});
  }

  function hasRequiredConfig(config = getConfig()) {
    return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  async function loadModules() {
    if (modules) return modules;
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]);
    modules = { appModule, authModule, firestoreModule, analyticsModule: null };
    return modules;
  }

  async function initAnalyticsIfPossible(config) {
    if (!config.measurementId || analyticsInstance) return;
    try {
      const analyticsModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-analytics.js`);
      if (await analyticsModule.isSupported()) {
        analyticsInstance = analyticsModule.getAnalytics(firebaseApp);
        modules.analyticsModule = analyticsModule;
      }
    } catch (error) {
      console.warn('Analytics Google non initialisé.', error);
    }
  }

  async function init() {
    if (firebaseAuth && firestoreDb) return { auth: firebaseAuth, db: firestoreDb, user: currentUser };
    if (initializingPromise) return initializingPromise;

    initializingPromise = (async () => {
      const config = getConfig();
      if (!hasRequiredConfig(config)) {
        currentStatus = 'Configuration Google manquante.';
        notifyAuthListeners();
        throw new Error('La configuration Google/Firebase est incomplète dans js/firebase-config.js.');
      }

      const { appModule, authModule, firestoreModule } = await loadModules();
      firebaseApp = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
      firebaseAuth = authModule.getAuth(firebaseApp);
      firestoreDb = firestoreModule.getFirestore(firebaseApp);

      try {
        await authModule.setPersistence(firebaseAuth, authModule.browserLocalPersistence);
      } catch (error) {
        console.warn('Persistance de connexion non modifiée.', error);
      }

      if (!authReadyPromise) {
        authReadyPromise = new Promise(resolve => {
          authModule.onAuthStateChanged(firebaseAuth, user => {
            currentUser = user;
            authReady = true;
            currentStatus = user ? 'Connecté.' : 'Connexion Google requise.';
            notifyAuthListeners();
            resolve(user);
          }, error => {
            authReady = true;
            currentStatus = getFriendlyError(error);
            notifyAuthListeners();
            resolve(null);
          });
        });
      }

      initAnalyticsIfPossible(config);
      currentStatus = 'Connexion prête.';
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
    if (authReady) return currentUser;
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
      currentStatus = 'Connecté.';
      notifyAuthListeners();
      return currentUser;
    } catch (error) {
      if (['auth/popup-blocked', 'auth/cancelled-popup-request', 'auth/popup-closed-by-user'].includes(error.code)) {
        await authModule.signInWithRedirect(auth, provider);
        return null;
      }
      throw new Error(getFriendlyError(error));
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
    if (!firestoreDb) throw new Error('Connexion aux données indisponible.');
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
    await firestoreModule.setDoc(cloudDocRef(), payload);
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
    currentStatus = 'Données chargées.';
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
    currentStatus = 'Données supprimées.';
    notifyAuthListeners();
  }

  function onAuthChange(listener) {
    authListeners.add(listener);
    listener({ user: currentUser, status: currentStatus, configured: hasRequiredConfig(), ready: authReady });
    return () => authListeners.delete(listener);
  }

  function notifyAuthListeners() {
    const payload = { user: currentUser, status: currentStatus, configured: hasRequiredConfig(), ready: authReady };
    authListeners.forEach(listener => listener(payload));
  }

  function getUser() {
    return currentUser;
  }

  function getStatus() {
    return currentStatus;
  }

  function getFriendlyError(error) {
    const code = error?.code || '';
    if (code === 'auth/unauthorized-domain') return 'Domaine non autorisé dans Firebase.';
    if (code === 'auth/network-request-failed') return 'Connexion internet indisponible.';
    if (code === 'auth/popup-closed-by-user') return 'Connexion annulée.';
    if (code === 'permission-denied') return 'Accès refusé par les règles Firestore.';
    if (String(error?.message || '').includes('Missing or insufficient permissions')) return 'Accès refusé par les règles Firestore.';
    return error?.message || 'Erreur Google/Firebase.';
  }

  window.TravelCloudSync = {
    getConfig,
    isConfigured: hasRequiredConfig,
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
