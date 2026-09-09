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
  if (user) {
    isOnboardingCompleted(user.uid).then((done) => {
      setOnboardingDone(done);
      setCheckingOnboarding(false);
    });
  }
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