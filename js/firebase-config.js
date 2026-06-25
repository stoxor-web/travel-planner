// Configuration Firebase de l'application web.
// Remplace les chaînes vides par les valeurs fournies dans Firebase Console > Project settings > Your apps.
// Ces clés identifient le projet Firebase côté client : la protection réelle dépend surtout des règles Firestore.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCfuWKq8ZwRPDtFhKpb3Q81FuJWd2VEBDU",
  authDomain: "travel-planner-60337.firebaseapp.com",
  projectId: "travel-planner-60337",
  storageBucket: "travel-planner-60337.firebasestorage.app",
  messagingSenderId: "981112659597",
  appId: "1:981112659597:web:92a0e42989ca6386458cc4",
  measurementId: "G-YMK5EDLSM9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
