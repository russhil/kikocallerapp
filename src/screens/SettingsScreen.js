import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Colors,
  FontSizes,
  FontWeights,
  BorderRadius,
  Spacing,
} from '../theme';
import { AuthContext } from '../context/AuthContext';
import CustomPopup from '../components/CustomPopup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  trackSettingsViewed,
  trackSettingsSaved,
  trackLogoutClicked,
} from '../utils/analytics';
import { useLang, APP_LANGUAGES } from '../i18n/LanguageContext';

const LANGUAGE_OPTIONS = [
  { label: 'Auto-Detect Language', value: 'auto' },
  { label: 'English (India)', value: 'en-IN' },
  { label: 'Hindi', value: 'hi-IN' },
  { label: 'Marathi', value: 'mr-IN' },
  { label: 'Gujarati', value: 'gu-IN' },
];

export default function SettingsScreen() {
  const nav = useNavigation();
  const { t, lang, setLang } = useLang();
  const { logout } = useContext(AuthContext);
  const [shopName, setShopName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [language, setLanguage] = useState('auto');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [popup, setPopup] = useState({
    visible: false,
    title: '',
    message: '',
    icon: 'info',
    buttons: [],
  });

  const showPopup = (title, message, icon, buttons) => {
    setPopup({
      visible: true,
      title,
      message,
      icon: icon || 'info',
      buttons: buttons || [
        {
          text: 'OK',
          onPress: () => setPopup(p => ({ ...p, visible: false })),
        },
      ],
    });
  };
  const hidePopup = () => setPopup(p => ({ ...p, visible: false }));

  useEffect(() => {
    loadSettings();
    trackSettingsViewed();
  }, []);

  const loadSettings = async () => {
    const sn = await AsyncStorage.getItem('shopName');
    const gn = await AsyncStorage.getItem('gstNumber');
    const sa = await AsyncStorage.getItem('storeAddress');
    const se = await AsyncStorage.getItem('storeEmail');
    const sp = await AsyncStorage.getItem('storePhone');
    const lang = await AsyncStorage.getItem('defaultLanguage');
    const cp = await AsyncStorage.getItem('customScanPath');
    if (sn) setShopName(sn);
    if (gn) setGstNumber(gn);
    if (sa) setStoreAddress(sa);
    if (se) setStoreEmail(se);
    if (sp) setStorePhone(sp);
    if (lang) setLanguage(lang);
    if (cp) {
      setCustomPath(cp);
      if (NativeModules.RecordingMonitorModule?.setCustomScanPath) {
        NativeModules.RecordingMonitorModule.setCustomScanPath(cp);
      }
    }
  };

  const saveSettings = async () => {
    await AsyncStorage.setItem('shopName', shopName);
    await AsyncStorage.setItem('gstNumber', gstNumber);
    await AsyncStorage.setItem('storeAddress', storeAddress);
    await AsyncStorage.setItem('storeEmail', storeEmail);
    await AsyncStorage.setItem('storePhone', storePhone);
    await AsyncStorage.setItem('defaultLanguage', language);
    await AsyncStorage.setItem('customScanPath', customPath);
    if (NativeModules.RecordingMonitorModule?.setCustomScanPath) {
      NativeModules.RecordingMonitorModule.setCustomScanPath(customPath);
    }
    showPopup(t('common.saved'), t('settings.savedMessage'), 'check');
    trackSettingsSaved(language);
  };

  const browseFolderPicker = async () => {
    try {
      if (!NativeModules.RecordingMonitorModule?.openFolderPicker) {
        showPopup(
          t('settings.notSupportedTitle'),
          t('settings.notSupportedMessage'),
          'error',
        );
        return;
      }
      const selectedPath =
        await NativeModules.RecordingMonitorModule.openFolderPicker();
      if (selectedPath) {
        setCustomPath(selectedPath);
        await AsyncStorage.setItem('customScanPath', selectedPath);
        if (NativeModules.RecordingMonitorModule?.setCustomScanPath) {
          NativeModules.RecordingMonitorModule.setCustomScanPath(selectedPath);
        }
        showPopup(
          t('settings.folderSelectedTitle'),
          t('settings.pathSetTo', { path: selectedPath }),
          'check',
        );
      }
    } catch (e) {
      if (e.code !== 'PICKER_CANCELLED') {
        showPopup(
          t('common.error'),
          t('settings.folderPickerFailed') + (e.message || e),
          'error',
        );
      }
    }
  };

  const onLogout = () => {
    showPopup(t('common.logout'), t('settings.logoutConfirm'), 'question', [
      { text: t('common.cancel'), style: 'outline', onPress: hidePopup },
      {
        text: t('common.logout'),
        style: 'destructive',
        onPress: () => {
          hidePopup();
          trackLogoutClicked();
          logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.appBar}>
        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.appBarTitle}>{t('common.settings')}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Business */}
        <Text style={s.sectionLabel}>{t('settings.businessSection')}</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>{t('common.shopName')}</Text>
          <TextInput
            style={s.input}
            value={shopName}
            onChangeText={setShopName}
            placeholder={t('settings.shopNamePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            maxFontSizeMultiplier={1.2}
          />

          <Text style={[s.fieldLabel, { marginTop: Spacing.md }]}>
            {t('settings.gstLabel')}
          </Text>
          <TextInput
            style={s.input}
            value={gstNumber}
            onChangeText={setGstNumber}
            placeholder={t('settings.gstPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            maxFontSizeMultiplier={1.2}
          />

          <Text style={[s.fieldLabel, { marginTop: Spacing.md }]}>
            {t('settings.storeAddressLabel')}
          </Text>
          <TextInput
            style={[
              s.input,
              { height: 80, textAlignVertical: 'top', paddingTop: Spacing.md },
            ]}
            value={storeAddress}
            onChangeText={setStoreAddress}
            placeholder={t('settings.storeAddressPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            multiline={true}
            maxFontSizeMultiplier={1.2}
          />

          <Text style={[s.fieldLabel, { marginTop: Spacing.md }]}>
            {t('settings.storeEmailLabel')}
          </Text>
          <TextInput
            style={s.input}
            value={storeEmail}
            onChangeText={setStoreEmail}
            placeholder={t('settings.storeEmailPlaceholder')}
            keyboardType="email-address"
            placeholderTextColor={Colors.textMuted}
            maxFontSizeMultiplier={1.2}
          />

          <Text style={[s.fieldLabel, { marginTop: Spacing.md }]}>
            {t('settings.storePhoneLabel')}
          </Text>
          <TextInput
            style={s.input}
            value={storePhone}
            onChangeText={setStorePhone}
            placeholder={t('settings.storePhonePlaceholder')}
            keyboardType="phone-pad"
            placeholderTextColor={Colors.textMuted}
            maxFontSizeMultiplier={1.2}
          />
        </View>

        {/* App Language — applies immediately (UI + order output/display) */}
        <Text style={s.sectionLabel}>{t('lang.section')}</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>{t('lang.fieldLabel')}</Text>
          <TouchableOpacity
            style={s.dropdown}
            onPress={() => setShowLangPicker(!showLangPicker)}
            activeOpacity={0.7}
          >
            <Text style={s.dropdownText}>
              {APP_LANGUAGES.find(o => o.value === lang)?.label || lang}
            </Text>
            <Icon name="chevron-down" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
          {showLangPicker && (
            <View style={s.pickerMenu}>
              {APP_LANGUAGES.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    s.pickerItem,
                    lang === opt.value && {
                      backgroundColor: Colors.primary + '0D',
                    },
                  ]}
                  onPress={() => {
                    setLang(opt.value);
                    setShowLangPicker(false);
                  }}
                >
                  <Text
                    style={[
                      s.pickerItemText,
                      lang === opt.value && {
                        color: Colors.primary,
                        fontWeight: FontWeights.bold,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {lang === opt.value && (
                    <Icon name="check" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Recording Storage */}
        <Text style={s.sectionLabel}>
          {t('settings.recordingStorageSection')}
        </Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>
            {t('settings.customFolderPathLabel')}
          </Text>
          <Text
            style={{
              ...s.processDesc,
              fontSize: FontSizes.xs,
              color: Colors.textSecondary,
              marginBottom: 8,
            }}
          >
            {t('settings.customFolderPathDesc')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {customPath ? (
              <View style={[s.input, { flex: 1, justifyContent: 'center' }]}>
                <Text
                  style={{
                    fontSize: FontSizes.body,
                    color: Colors.textPrimary,
                  }}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {customPath}
                </Text>
              </View>
            ) : (
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={customPath}
                onChangeText={setCustomPath}
                placeholder={t('settings.customPathPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                maxFontSizeMultiplier={1.2}
              />
            )}
            <TouchableOpacity
              style={s.browseBtn}
              onPress={browseFolderPicker}
              activeOpacity={0.7}
            >
              <Icon name="folder-open-outline" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {customPath ? (
            <TouchableOpacity
              onPress={() => {
                setCustomPath('');
                AsyncStorage.setItem('customScanPath', '');
                if (NativeModules.RecordingMonitorModule?.setCustomScanPath) {
                  NativeModules.RecordingMonitorModule.setCustomScanPath('');
                }
              }}
              style={{ marginTop: 8, alignSelf: 'flex-end' }}
            >
              <Text style={{ fontSize: FontSizes.xs, color: Colors.error }}>
                {t('settings.clearPath')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Processing Status */}
        <Text style={s.sectionLabel}>{t('settings.processingSection')}</Text>
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={s.statusDot} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.processTitle}>
                {t('settings.autoProcessingTitle')}
              </Text>
              <Text style={s.processDesc}>
                {t('settings.autoProcessingDesc')}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={s.saveBtn}
          onPress={saveSettings}
          activeOpacity={0.7}
        >
          <Text style={s.saveBtnText}>{t('settings.saveSettings')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={onLogout}
          activeOpacity={0.7}
        >
          <Text style={s.logoutBtnText}>{t('common.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <CustomPopup {...popup} onClose={hidePopup} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    elevation: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  backIcon: {
    fontSize: 20,
    color: Colors.textPrimary,
    fontWeight: FontWeights.bold,
  },
  appBarTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },

  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    letterSpacing: 1.2,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.sm,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.divider,
  },
  fieldLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontWeight: FontWeights.medium,
    marginBottom: 8,
  },
  input: {
    height: 50,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  browseBtn: {
    width: 50,
    height: 50,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdown: {
    height: 50,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
  dropdownArrow: { fontSize: 12, color: Colors.textMuted },
  pickerMenu: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.divider,
  },
  pickerItemText: {
    flex: 1,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  pickerCheck: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.success,
  },
  processTitle: {
    fontSize: FontSizes.body,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
  },
  processDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: Colors.error + '4D',
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  logoutBtnText: {
    color: Colors.error,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
});
