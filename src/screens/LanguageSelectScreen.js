import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  Colors,
  FontSizes,
  FontWeights,
  BorderRadius,
  Spacing,
} from '../theme';
import { useLang, APP_LANGUAGES } from '../i18n/LanguageContext';

// Shown once at the very first launch (before onboarding/login) so a user who
// only reads Hindi/Gujarati can pick their language immediately. Gated by the
// AsyncStorage flag `languageChosen` so existing users see it once after update.
export default function LanguageSelectScreen({ onDone }) {
  const { lang, setLang } = useLang();
  const [sel, setSel] = useState(lang || 'en');

  const pick = v => {
    setSel(v);
    setLang(v); // apply live so the Continue button label etc. reflect choice
  };

  const onContinue = async () => {
    await setLang(sel);
    try {
      await AsyncStorage.setItem('languageChosen', 'true');
    } catch (e) {}
    onDone && onDone();
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        <View style={s.logoBox}>
          <Icon name="translate" size={40} color={Colors.white} />
        </View>
        <Text style={s.title}>Choose your language</Text>
        <Text style={s.subtitle}>अपनी भाषा चुनें • તમારી ભાષા પસંદ કરો</Text>

        <View style={s.list}>
          {APP_LANGUAGES.map(opt => {
            const active = sel === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s.card, active && s.cardActive]}
                onPress={() => pick(opt.value)}
                activeOpacity={0.85}
              >
                <Text style={[s.cardText, active && s.cardTextActive]}>
                  {opt.label}
                </Text>
                {active && (
                  <Icon name="check-circle" size={24} color={Colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity style={s.btn} onPress={onContinue} activeOpacity={0.85}>
        <Text style={s.btnText}>Continue · आगे बढ़ें · આગળ વધો</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.xxl,
  },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.heading,
    fontWeight: FontWeights.extraBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xxl,
  },
  list: { width: '100%' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 18,
    marginBottom: Spacing.md,
  },
  cardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0D',
  },
  cardText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
  },
  cardTextActive: { color: Colors.primary, fontWeight: FontWeights.bold },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    color: Colors.white,
    fontSize: FontSizes.body,
    fontWeight: FontWeights.bold,
  },
});
