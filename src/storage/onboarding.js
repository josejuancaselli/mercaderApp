import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function isOnboardingCompleted(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() && snap.data().onboardingCompleted === true;
}

export async function setOnboardingCompleted(uid) {
  await setDoc(doc(db, 'users', uid), { onboardingCompleted: true }, { merge: true });
}

export async function completeOnboarding(uid, profileData) {
  await setDoc(
    doc(db, 'users', uid),
    { ...profileData, onboardingCompleted: true },
    { merge: true }
  );
}