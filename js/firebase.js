// js/firebase.js
import { initializeApp } from "firebase/app";
import {
    getAuth,
    signInAnonymously,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    updateProfile
} from "firebase/auth";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    increment
} from "firebase/firestore";

// ✅ TU CONFIGURACIÓN REAL DE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCYMOckxXH9Hpc9PC5XJlbYLSG1JLyYVvY",
  authDomain: "neonstrike3d.firebaseapp.com",
  projectId: "neonstrike3d",
  storageBucket: "neonstrike3d.firebasestorage.app",
  messagingSenderId: "190131261088",
  appId: "1:190131261088:web:28ca86b84e7b194f7f83c5",
  measurementId: "G-YD9J4BKQ2P"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- Autenticación ---

export const loginAnonimo = async (nickname) => {
    const result = await signInAnonymously(auth);
    if (nickname) {
        await updateProfile(result.user, { displayName: nickname });
    }
    return result.user;
};

export const loginGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
};

export const escucharAuth = (callback) => {
    return onAuthStateChanged(auth, callback);
};

// --- Firestore: Perfil de usuario ---

export const obtenerPerfilUsuario = async (uid, nombrePorDefecto = "Invocador") => {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        return userSnap.data();
    } else {
        const perfilInicial = {
            uid: uid,
            nombre: nombrePorDefecto,
            tag: "[N00B]",
            nivel: 1,
            xp: 0,
            monedas: 500,
            skinEquipada: "default",
            efectoKill: "default",
            tagEquipado: "[N00B]",
            inventario: ["default"],
            creadoEn: Date.now()
        };
        await setDoc(userRef, perfilInicial);
        return perfilInicial;
    }
};

export const guardarEstadisticasPartida = async (uid, xpGanada, monedasGanadas) => {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
        xp: increment(xpGanada),
        monedas: increment(monedasGanadas)
    });
};

export const actualizarPerfil = async (uid, cambios) => {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, cambios);
};