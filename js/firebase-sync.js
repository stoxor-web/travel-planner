(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const LOCAL_CONFIG_KEY = 'travelPlanner:firebaseConfig';
  const AUTO_SYNC_KEY = 'travelPlanner:firebaseAutoSync';
  const COLLECTION = 'travelPlannerUsers';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let modules = null;
  let currentUser = null;
  let currentStatus = 'Firebase non configuré.';
  let initializingPromise = null;
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

  function hasRequiredConfig(config = getConfig()) {
    return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  function getEmbeddedConfig() {
    return cleanConfig(window.TRAVEL_PLANNER_FIREBASE_CONFIG || {});
  }

  function getStoredConfig() {
    try {
      const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
      return raw ? cleanConfig(JSON.parse(raw)) : cleanConfig({});
    } catch (error) {
      console.warn('Configuration Firebase locale invalide.', error);
      return cleanConfig({});
    }
  }

  function getConfig() {
    const stored = getStoredConfig();
    return hasConfigValues(stored) ? stored : getEmbeddedConfig();
  }

  function hasConfigValues(config) {
    return Object.values(cleanConfig(config)).some(Boolean);
  }

  function saveConfig(config) {
    const cleaned = cleanConfig(config);
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(cleaned));
    resetRuntime();
    return cleaned;
  }

  function clearStoredConfig() {
    localStorage.removeItem(LOCAL_CONFIG_KEY);
    resetRuntime();
  }

  function resetRuntime() {
    firebaseApp = null;
    firebaseAuth = null;
    firestoreDb = null;
    modules = null;
    currentUser = null;
    initializingPromise = null;
    currentStatus = hasRequiredConfig() ? 'Firebase configuré. Connexion Google disponible.' : 'Firebase non configuré.';
    notifyAuthListeners();
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
      if (!hasRequiredConfig(config)) {
        currentStatus = 'Firebase n’est pas configuré. Renseigne apiKey, authDomain, projectId et appId.';
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
      try {
        const redirectResult = await authModule.getRedirectResult(firebaseAuth);
        if (redirectResult?.user) {
          currentUser = redirectResult.user;
          currentStatus = `Connecté avec ${currentUser.email || currentUser.displayName || 'Google'}.`;
          notifyAuthListeners();
        }
      } catch (error) {
        console.warn('Résultat de redirection Google ignoré.', error);
        currentStatus = humanizeFirebaseError(error);
        notifyAuthListeners();
      }
      authModule.onAuthStateChanged(firebaseAuth, user => {
        currentUser = user;
        currentStatus = user ? `Connecté avec ${user.email || user.displayName || 'Google'}.` : 'Connexion Google requise.';
        notifyAuthListeners();
      });
      currentStatus = currentUser ? `Connecté avec ${currentUser.email || currentUser.displayName || 'Google'}.` : 'Firebase prêt.';
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

  function humanizeFirebaseError(error) {
    const code = error?.code || '';
    const messages = {
      'auth/unauthorized-domain': 'Domaine non autorisé dans Firebase Authentication.',
      'auth/popup-blocked': 'Popup bloquée. Connexion par redirection lancée.',
      'auth/cancelled-popup-request': 'Connexion déjà en cours.',
      'auth/popup-closed-by-user': 'Fenêtre de connexion fermée.',
      'auth/network-request-failed': 'Connexion réseau impossible.',
      'permission-denied': 'Accès Firestore refusé. Vérifie les règles de sécurité.'
    };
    return messages[code] || error?.message || 'Erreur Firebase.';
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
      if (['auth/popup-blocked', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
        currentStatus = 'Redirection Google en cours…';
        notifyAuthListeners();
        await authModule.signInWithRedirect(auth, provider);
        return null;
      }
      error.message = humanizeFirebaseError(error);
      throw error;
    }
  }

  async function signOut() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    await authModule.signOut(auth);
    currentUser = null;
    currentStatus = 'Déconnecté de Firebase.';
    notifyAuthListeners();
  }

  function requireSignedIn() {
    if (!currentUser) throw new Error('Connecte-toi d’abord avec ton compte Google.');
    if (!firestoreDb) throw new Error('Firebase n’est pas initialisé.');
  }

  function cloudDocRef() {
    const { firestoreModule } = modules;
    return firestoreModule.doc(firestoreDb, COLLECTION, currentUser.uid);
  }

  function publicTripDocRef(shareId) {
    const { firestoreModule } = modules;
    return firestoreModule.doc(firestoreDb, 'publicTrips', shareId);
  }

  function collaborativeTripDocRef(shareId) {
    const { firestoreModule } = modules;
    return firestoreModule.doc(firestoreDb, 'sharedTrips', shareId);
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
    currentStatus = `Sauvegarde Google mise à jour pour ${currentUser.email || 'ce compte'}.`;
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
    currentStatus = `Sauvegarde Google chargée pour ${currentUser.email || 'ce compte'}.`;
    notifyAuthListeners();
    return {
      state: data.state || null,
      clientUpdatedAt: data.clientUpdatedAt || '',
      ownerEmail: data.ownerEmail || '',
      schemaVersion: data.schemaVersion || 1
    };
  }


  function waitForAuthState(timeoutMs = 5000) {
    return new Promise(resolve => {
      if (!firebaseAuth) return resolve(currentUser);
      let done = false;
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        unsubscribe();
        resolve(currentUser);
      }, timeoutMs);
      const { authModule } = modules;
      unsubscribe = authModule.onAuthStateChanged(firebaseAuth, user => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        currentUser = user;
        unsubscribe();
        resolve(user);
      });
    });
  }

  async function deleteState() {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(cloudDocRef());
    currentStatus = 'Données Google supprimées.';
    notifyAuthListeners();
  }

  function sanitizeTripForPublic(trip, options = {}) {
    const copy = JSON.parse(JSON.stringify(trip || {}));
    if (options.hideBudget) {
      copy.maxBudget = 0;
      copy.expenses = [];
      copy.steps = (copy.steps || []).map(step => ({ ...step, cost: 0, segmentCost: 0 }));
    }
    if (options.hideNotes) {
      copy.description = '';
      copy.steps = (copy.steps || []).map(step => ({ ...step, notes: '', links: [], segmentNote: '' }));
    }
    if (options.hideJournal) {
      copy.steps = (copy.steps || []).map(step => ({ ...step, journal: {} }));
    }
    return copy;
  }

  async function publishTripShare(trip, options = {}) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const shareId = trip.shareId || `${currentUser.uid.slice(0, 8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      public: true,
      schema: 'travelPlannerPublicTrip',
      schemaVersion: 1,
      shareId,
      options: { hideBudget: Boolean(options.hideBudget), hideNotes: Boolean(options.hideNotes), hideJournal: Boolean(options.hideJournal) },
      trip: sanitizeTripForPublic({ ...trip, shareId }, options),
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: firestoreModule.serverTimestamp()
    };
    await firestoreModule.setDoc(publicTripDocRef(shareId), payload);
    currentStatus = 'Lien de partage mis à jour.';
    notifyAuthListeners();
    return { shareId, payload };
  }

  async function loadPublicShare(shareId) {
    await init();
    const { firestoreModule } = await loadModules();
    const snapshot = await firestoreModule.getDoc(publicTripDocRef(shareId));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    if (!data.public || data.schema !== 'travelPlannerPublicTrip') throw new Error('Ce partage n’est pas public.');
    currentStatus = 'Voyage partagé chargé.';
    notifyAuthListeners();
    return data;
  }


  function normalizeEmails(value) {
    if (Array.isArray(value)) return value.map(email => String(email || '').trim().toLowerCase()).filter(Boolean);
    return String(value || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  }

  async function publishCollaborativeTrip(trip, emails = []) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const collaborators = normalizeEmails(emails);
    const shareId = trip.collabId || `${currentUser.uid.slice(0, 8)}_co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      collaborators,
      schema: 'travelPlannerCollaborativeTrip',
      schemaVersion: 1,
      shareId,
      trip: JSON.parse(JSON.stringify({ ...trip, collabId: shareId, collaborators })),
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: firestoreModule.serverTimestamp()
    };
    await firestoreModule.setDoc(collaborativeTripDocRef(shareId), payload);
    currentStatus = 'Collaboration privée créée.';
    notifyAuthListeners();
    return { shareId, payload };
  }

  async function loadCollaborativeTrip(shareId) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const snapshot = await firestoreModule.getDoc(collaborativeTripDocRef(shareId));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    currentStatus = 'Voyage collaboratif chargé.';
    notifyAuthListeners();
    return data;
  }

  async function saveCollaborativeTrip(shareId, trip) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const ref = collaborativeTripDocRef(shareId);
    await firestoreModule.updateDoc(ref, {
      trip: JSON.parse(JSON.stringify({ ...trip, collabId: shareId })),
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: firestoreModule.serverTimestamp()
    });
    currentStatus = 'Collaboration privée sauvegardée.';
    notifyAuthListeners();
  }

  function isAutoSyncEnabled() {
    return localStorage.getItem(AUTO_SYNC_KEY) === 'true';
  }

  function setAutoSyncEnabled(enabled) {
    localStorage.setItem(AUTO_SYNC_KEY, enabled ? 'true' : 'false');
  }

  function onAuthChange(listener) {
    authListeners.add(listener);
    listener({ user: currentUser, status: currentStatus, configured: hasRequiredConfig(), autoSync: isAutoSyncEnabled() });
    return () => authListeners.delete(listener);
  }

  function notifyAuthListeners() {
    const payload = { user: currentUser, status: currentStatus, configured: hasRequiredConfig(), autoSync: isAutoSyncEnabled() };
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
    getStoredConfig,
    getEmbeddedConfig,
    saveConfig,
    clearStoredConfig,
    isConfigured: hasRequiredConfig,
    init,
    signIn,
    signOut,
    saveState,
    loadState,
    waitForAuthState,
    deleteState,
    publishTripShare,
    loadPublicShare,
    publishCollaborativeTrip,
    loadCollaborativeTrip,
    saveCollaborativeTrip,
    getUser,
    getStatus,
    onAuthChange,
    isAutoSyncEnabled,
    setAutoSyncEnabled
  };
})();
