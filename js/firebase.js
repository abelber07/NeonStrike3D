// js/firebase.js
import { initializeApp } from "firebase/app";
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    updateProfile,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    setPersistence,
    inMemoryPersistence,
    signOut
} from "firebase/auth";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    increment,
    runTransaction
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

export const prepararAutenticacionManual = async () => {
    await setPersistence(auth, inMemoryPersistence);
    await signOut(auth);
};

export const registrarCuenta = async (email, password, nickname) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (nickname) await updateProfile(result.user, { displayName: nickname });
    return result.user;
};

export const iniciarSesion = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
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

export const obtenerPerfilUsuario = async (uid, nombrePorDefecto = "Jugador") => {
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

const CATALOGO_ITEMS = {
    "neon-blue": { precio: 250 },
    "neon-pink": { precio: 400 },
    "nova-burst": { precio: 350 },
    "tag-hunter": { precio: 200 }
};

const PASE_RECOMPENSAS = {
    1: { monedas: 100 },
    2: { itemId: "neon-blue" },
    3: { monedas: 200 },
    4: { itemId: "nova-burst" },
    5: { monedas: 300 }
};

export const comprarItem = async (uid, itemId) => {
    const catalogItem = CATALOGO_ITEMS[itemId];
    if (!catalogItem) throw new Error("Ese artículo no está disponible.");
    const userRef = doc(db, "users", uid);
    let perfilActualizado;
    await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists()) {
            throw new Error("No se encontró el perfil del jugador.");
        }

        const perfil = snapshot.data();
        const inventario = Array.isArray(perfil.inventario) ? perfil.inventario : ["default"];
        const monedas = Number(perfil.monedas) || 0;
        if (inventario.includes(itemId)) {
            perfilActualizado = { ...perfil, inventario };
            return;
        }
        if (monedas < catalogItem.precio) {
            throw new Error("No tienes suficientes monedas.");
        }

        const nuevosDatos = {
            monedas: monedas - catalogItem.precio,
            inventario: [...inventario, itemId]
        };
        transaction.update(userRef, nuevosDatos);
        perfilActualizado = { ...perfil, ...nuevosDatos };
    });
    return perfilActualizado;
};

export const reclamarRecompensa = async (uid, nivel) => {
    const recompensa = PASE_RECOMPENSAS[nivel];
    if (!recompensa) throw new Error("Recompensa de pase no válida.");

    const userRef = doc(db, "users", uid);
    let perfilActualizado;
    await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(userRef);
        if (!snapshot.exists()) throw new Error("No se encontró el perfil del jugador.");
        const perfil = snapshot.data();
        const nivelActual = Number(perfil.nivel) || 1;
        const recompensas = Array.isArray(perfil.recompensas) ? perfil.recompensas : [];
        if (nivelActual < nivel) throw new Error("Todavía no has desbloqueado esta recompensa.");
        if (recompensas.includes(nivel)) {
            perfilActualizado = perfil;
            return;
        }

        const inventario = Array.isArray(perfil.inventario) ? perfil.inventario : ["default"];
        const cambios = { recompensas: [...recompensas, nivel] };
        if (recompensa.monedas) cambios.monedas = (Number(perfil.monedas) || 0) + recompensa.monedas;
        if (recompensa.itemId && !inventario.includes(recompensa.itemId)) {
            cambios.inventario = [...inventario, recompensa.itemId];
        }
        transaction.update(userRef, cambios);
        perfilActualizado = { ...perfil, ...cambios };
    });
    return perfilActualizado;
};