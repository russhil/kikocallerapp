import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  Colors,
  FontSizes,
  FontWeights,
  BorderRadius,
  Spacing,
} from '../theme';
import { useLang, APP_LANGUAGES } from '../i18n/LanguageContext';

// Compact 3-way language selector used at setup/signup. Applies immediately
// (persists appLanguage) so the surrounding UI re-renders in the chosen language.
export default function LanguagePills({ style }) {
  const { lang, setLang } = useLang();
  return (
    <View style={[s.row, style]}>
      {APP_LANGUAGES.map(opt => {
        const active = lang === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[s.pill, active && s.pillActive]}
            onPress={() => setLang(opt.value)}
            activeOpacity={0.8}
          >
            <Text
              style={[s.pillText, active && s.pillTextActive]}
              maxFontSizeMultiplier={1.2}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full || 999,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    backgroundColor: Colors.surfaceLight,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semiBold,
  },
  pillTextActive: { color: Colors.white },
});
