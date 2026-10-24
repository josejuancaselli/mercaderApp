import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, ActivityIndicator } from 'react-native';
import TabNavigator from './TabNavigator';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import { isOnboardingCompleted } from '../storage/onboarding';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';

export default function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    // Sin usuario: reiniciar el estado para que el próximo login no herede el del anterior
    if (!user) {
      setOnboardingDone(false);
      setCheckingOnboarding(true);
      return;
    }
    let cancelled = false;
    isOnboardingCompleted(user.uid)
      .then((done) => {
        if (!cancelled) setOnboardingDone(done);
      })
      .catch((e) => {
        console.warn('isOnboardingCompleted falló', e);
        if (!cancelled) setOnboardingDone(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingOnboarding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || (user && checkingOnboarding)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <LoginScreen />
      ) : onboardingDone ? (
        <TabNavigator />
      ) : (
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
      )}
    </NavigationContainer>
  );
}