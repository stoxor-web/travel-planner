(function () {
  'use strict';

  const SDK_VERSION = '10.12.5';
  const LOCAL_CONFIG_KEY = 'travelPlanner:firebaseConfig';
  const AUTO_SYNC_KEY = 'travelPlanner:firebaseAutoSync';
  const COLLECTION = 'travelPlannerUsers';
  const COMMUNITY_COLLECTION = 'communityTrips';

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let modules = null;
  let currentUser = null;
  let currentStatus = 'Firebase non configuré.';
  let initializingPromise = null;
  let authReadyPromise = null;
  let authReadyResolved = false;
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
    authReadyPromise = null;
    authReadyResolved = false;
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
      authReadyResolved = false;
      authReadyPromise = new Promise(resolve => {
        authModule.onAuthStateChanged(firebaseAuth, user => {
          currentUser = user;
          currentStatus = user ? `Connecté à Firebase avec ${user.email || user.displayName || 'un compte Google'}.` : 'Firebase configuré. Aucun compte Google connecté.';
          notifyAuthListeners();
          if (!authReadyResolved) {
            authReadyResolved = true;
            resolve(user || null);
          }
        });
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
    return authReadyPromise || currentUser || null;
  }

  async function signIn() {
    const { auth } = await init();
    const { authModule } = await loadModules();
    const provider = new authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await authModule.signInWithPopup(auth, provider);
      currentUser = result.user;
      currentStatus = `Connecté à Firebase avec ${currentUser.email || currentUser.displayName || 'Google'}.`;
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

  async function deleteState() {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(cloudDocRef());
    currentStatus = 'Données Firebase supprimées pour ce compte.';
    notifyAuthListeners();
  }

  function serializeFirestoreDoc(snapshot) {
    const data = snapshot.data() || {};
    return {
      id: snapshot.id,
      ...data,
      publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : (data.publishedAt || ''),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || '')
    };
  }

  function communityDocRef(id) {
    const { firestoreModule } = modules;
    return firestoreModule.doc(firestoreDb, COMMUNITY_COLLECTION, id);
  }

  async function listCommunityTrips() {
    await init();
    const { firestoreModule } = await loadModules();
    const snapshot = await firestoreModule.getDocs(firestoreModule.collection(firestoreDb, COMMUNITY_COLLECTION));
    return snapshot.docs.map(serializeFirestoreDoc).filter(item => item.schema === 'communityTrip');
  }

  function buildCommunityId(sourceTripId) {
    const raw = `${currentUser.uid}_${sourceTripId || Date.now()}`;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
  }

  async function publishCommunityTrip(payload) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const id = buildCommunityId(payload.sourceTripId);
    const ref = communityDocRef(id);
    const existingSnap = await firestoreModule.getDoc(ref);
    const existing = existingSnap.exists() ? existingSnap.data() : {};
    const nowIso = new Date().toISOString();
    const existingPublishedAt = existing.publishedAt?.toDate ? existing.publishedAt.toDate().toISOString() : (typeof existing.publishedAt === 'string' ? existing.publishedAt : nowIso);
    const doc = JSON.parse(JSON.stringify({
      schema: 'communityTrip',
      schemaVersion: 1,
      id,
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      ownerName: currentUser.displayName || currentUser.email || 'Voyageur',
      sourceTripId: payload.sourceTripId || '',
      title: payload.title || 'Voyage partagé',
      country: payload.country || payload.area || '',
      area: payload.area || payload.country || '',
      category: payload.category || 'citybreak',
      style: payload.style || 'équilibré',
      pace: payload.pace || 'normal',
      interests: payload.interests || '',
      description: payload.description || '',
      coverImage: payload.coverImage || '',
      currency: payload.currency || '€',
      publicBudget: Number(payload.publicBudget) || 0,
      hideBudget: Boolean(payload.hideBudget),
      hideNotes: Boolean(payload.hideNotes),
      allowCopy: payload.allowCopy !== false,
      durationDays: Number(payload.durationDays) || 0,
      stepsCount: Number(payload.stepsCount) || 0,
      highlights: Array.isArray(payload.highlights) ? payload.highlights : [],
      trip: payload.trip || {},
      votes: existing.votes || {},
      upVotes: Number(existing.upVotes) || 0,
      downVotes: Number(existing.downVotes) || 0,
      trendScore: Number(existing.trendScore) || 0,
      publishedAt: existingPublishedAt,
      updatedAt: firestoreModule.serverTimestamp()
    }));
    doc.updatedAt = firestoreModule.serverTimestamp();
    await firestoreModule.setDoc(ref, doc);
    return { ...doc, updatedAt: nowIso };
  }

  async function voteCommunityTrip(id, value) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    const ref = communityDocRef(id);
    const result = await firestoreModule.runTransaction(firestoreDb, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Voyage communautaire introuvable.');
      const data = snapshot.data();
      const votes = { ...(data.votes || {}) };
      const previous = Number(votes[currentUser.uid]) || 0;
      const requested = value > 0 ? 1 : -1;
      if (previous === requested) delete votes[currentUser.uid];
      else votes[currentUser.uid] = requested;
      const values = Object.values(votes).map(Number);
      const upVotes = values.filter(v => v > 0).length;
      const downVotes = values.filter(v => v < 0).length;
      const trendScore = upVotes - downVotes;
      transaction.update(ref, { votes, upVotes, downVotes, trendScore, updatedAt: firestoreModule.serverTimestamp() });
      return { ...data, id: snapshot.id, votes, upVotes, downVotes, trendScore };
    });
    return result;
  }

  async function deleteCommunityTrip(id) {
    await init();
    requireSignedIn();
    const { firestoreModule } = await loadModules();
    await firestoreModule.deleteDoc(communityDocRef(id));
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
    waitForAuthState,
    signIn,
    signOut,
    saveState,
    loadState,
    deleteState,
    listCommunityTrips,
    publishCommunityTrip,
    voteCommunityTrip,
    deleteCommunityTrip,
    getUser,
    getStatus,
    onAuthChange,
    isAutoSyncEnabled,
    setAutoSyncEnabled
  };
})();
