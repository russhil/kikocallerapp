import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Linking,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { trackHelpButtonClicked, trackHelpLanguageSelected } from '../utils/analytics';

const {width} = Dimensions.get('window');

const HELP_URLS = {
  english: 'https://ordertaker.kiko.live/selfhelp/?lang=en',
  hindi: 'https://ordertaker.kiko.live/selfhelp/?lang=hi',
};

/**
 * Global floating Help button component.
 * Shows a persistent FAB on all screens.
 * On press, shows a language selection popup,
 * then opens the appropriate help URL in the browser.
 */
export default function HelpButton() {
  const [showModal, setShowModal] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fabPulse = useRef(new Animated.Value(1)).current;

  // Subtle pulse animation on mount to draw attention
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(fabPulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    // Stop pulsing after 6 seconds to avoid distraction
    const timeout = setTimeout(() => pulse.stop(), 6000);
    return () => {
      pulse.stop();
      clearTimeout(timeout);
    };
  }, []);

  const openModal = () => {
    console.log('[Help] Help button tapped');
    trackHelpButtonClicked();
    setShowModal(true);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(scaleAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setShowModal(false));
  };

  const openHelp = async (lang) => {
    const url = HELP_URLS[lang];
    console.log(`[Help] Opening ${lang} help: ${url}`);
    trackHelpLanguageSelected(lang);
    closeModal();
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // Fallback: try opening anyway
        await Linking.openURL(url);
      }
    } catch (e) {
      console.error('[Help] Failed to open URL:', e);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <Animated.View
        style={[s.fabContainer, {transform: [{scale: fabPulse}]}]}
        pointerEvents="box-none">
        <TouchableOpacity
          style={s.fab}
          onPress={openModal}
          activeOpacity={0.8}
          accessibilityLabel="Help"
          accessibilityHint="Opens help and support options">
          <Icon name="help-circle-outline" size={22} color={Colors.white} />
          <Text style={s.fabText}>Help</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Language Selection Modal */}
      <Modal
        transparent
        visible={showModal}
        animationType="none"
        onRequestClose={closeModal}
        statusBarTranslucent>
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={closeModal}>
          <Animated.View
            style={[
              s.card,
              {
                transform: [{scale: scaleAnim}],
                opacity: scaleAnim,
              },
            ]}>
            <TouchableOpacity activeOpacity={1}>
              {/* Header */}
              <View style={s.cardHeader}>
                <View style={s.headerIconBox}>
                  <Icon
                    name="help-circle"
                    size={28}
                    color={Colors.primary}
                  />
                </View>
                <View style={{flex: 1, marginLeft: 12}}>
                  <Text style={s.cardTitle}>Help & Support</Text>
                  <Text style={s.cardSubtitle}>
                    Choose your preferred language
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeModal}
                  hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                  <Icon name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Divider */}
              <View style={s.divider} />

              {/* Language Options */}
              <TouchableOpacity
                style={s.langOption}
                onPress={() => openHelp('english')}
                activeOpacity={0.7}>
                <View style={[s.langIcon, {backgroundColor: '#4F46E5' + '14'}]}>
                  <Text style={s.langFlag}>🇬🇧</Text>
                </View>
                <View style={{flex: 1, marginLeft: 14}}>
                  <Text style={s.langTitle}>English</Text>
                  <Text style={s.langDesc}>
                    Tutorials, guides & support
                  </Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={22}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.langOption, {borderBottomWidth: 0}]}
                onPress={() => openHelp('hindi')}
                activeOpacity={0.7}>
                <View style={[s.langIcon, {backgroundColor: '#F97316' + '14'}]}>
                  <Text style={s.langFlag}>🇮🇳</Text>
                </View>
                <View style={{flex: 1, marginLeft: 14}}>
                  <Text style={s.langTitle}>हिंदी (Hindi)</Text>
                  <Text style={s.langDesc}>
                    ट्यूटोरियल, गाइड और सहायता
                  </Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={22}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>

              {/* Footer hint */}
              <View style={s.footerHint}>
                <Icon
                  name="open-in-new"
                  size={14}
                  color={Colors.textMuted}
                />
                <Text style={s.footerText}>
                  Opens in your browser
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // FAB
  fabContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    right: 16,
    zIndex: 9999,
    elevation: 20,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
  },
  fabText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    marginLeft: 6,
    letterSpacing: 0.3,
  },

  // Modal overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },

  // Card
  card: {
    width: Math.min(width - 48, 360),
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 10},
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
  },

  // Language options
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.divider,
  },
  langIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langFlag: {
    fontSize: 22,
  },
  langTitle: {
    fontSize: FontSizes.body,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
  },
  langDesc: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Footer
  footerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: Colors.surfaceLight,
  },
  footerText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginLeft: 6,
  },
});
