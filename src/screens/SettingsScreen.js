import React, {useState, useEffect, useContext} from 'react';
import {View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, NativeModules} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import {AuthContext} from '../context/AuthContext';
import CustomPopup from '../components/CustomPopup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { trackSettingsViewed, trackSettingsSaved, trackLogoutClicked } from '../utils/analytics';

const LANGUAGE_OPTIONS = [
  {label: 'Auto-Detect Language', value: 'auto'},
  {label: 'English (India)', value: 'en-IN'},
  {label: 'Hindi', value: 'hi-IN'},
  {label: 'Marathi', value: 'mr-IN'},
  {label: 'Gujarati', value: 'gu-IN'},
];

export default function SettingsScreen() {
  const nav = useNavigation();
  const {logout} = useContext(AuthContext);
  const [shopName, setShopName] = useState('');
  const [language, setLanguage] = useState('auto');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [popup, setPopup] = useState({visible: false, title: '', message: '', icon: 'info', buttons: []});

  const showPopup = (title, message, icon, buttons) => {
    setPopup({visible: true, title, message, icon: icon || 'info', buttons: buttons || [{text: 'OK', onPress: () => setPopup(p => ({...p, visible: false}))}]});
  };
  const hidePopup = () => setPopup(p => ({...p, visible: false}));

  useEffect(() => {
    loadSettings();
    trackSettingsViewed();
  }, []);

  const loadSettings = async () => {
    const sn = await AsyncStorage.getItem('shopName');
    const lang = await AsyncStorage.getItem('defaultLanguage');
    const cp = await AsyncStorage.getItem('customScanPath');
    if (sn) setShopName(sn);
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
    await AsyncStorage.setItem('defaultLanguage', language);
    await AsyncStorage.setItem('customScanPath', customPath);
    if (NativeModules.RecordingMonitorModule?.setCustomScanPath) {
      NativeModules.RecordingMonitorModule.setCustomScanPath(customPath);
    }
    showPopup('Saved', 'Settings saved successfully!', 'check');
    trackSettingsSaved(language);
  };

  const browseFolderPicker = async () => {
    try {
      if (!NativeModules.RecordingMonitorModule?.openFolderPicker) {
        showPopup('Not Supported', 'Folder picker is not available on this device.', 'error');
        return;
      }
      const selectedPath = await NativeModules.RecordingMonitorModule.openFolderPicker();
      if (selectedPath) {
        setCustomPath(selectedPath);
        await AsyncStorage.setItem('customScanPath', selectedPath);
        if (NativeModules.RecordingMonitorModule?.setCustomScanPath) {
          NativeModules.RecordingMonitorModule.setCustomScanPath(selectedPath);
        }
        showPopup('Folder Selected', `Path set to:\n${selectedPath}`, 'check');
      }
    } catch (e) {
      if (e.code !== 'PICKER_CANCELLED') {
        showPopup('Error', 'Failed to open folder picker: ' + (e.message || e), 'error');
      }
    }
  };

  const onLogout = () => {
    showPopup('Logout', 'Are you sure you want to logout?', 'question', [
      {text: 'Cancel', style: 'outline', onPress: hidePopup},
      {text: 'Logout', style: 'destructive', onPress: () => { hidePopup(); trackLogoutClicked(); logout(); }},
    ]);
  };

  const selectedLabel = LANGUAGE_OPTIONS.find(o => o.value === language)?.label || language;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.appBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.appBarTitle}>Settings</Text>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: Spacing.lg, paddingBottom: 40}} showsVerticalScrollIndicator={false}>
        {/* Business */}
        <Text style={s.sectionLabel}>BUSINESS</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Shop Name</Text>
          <TextInput style={s.input} value={shopName} onChangeText={setShopName} placeholder="Enter your shop name" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
        </View>

        {/* Language */}
        <Text style={s.sectionLabel}>LANGUAGE</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Transcription Language</Text>
          <TouchableOpacity style={s.dropdown} onPress={() => setShowLangPicker(!showLangPicker)} activeOpacity={0.7}>
            <Text style={s.dropdownText}>{selectedLabel}</Text>
            <Icon name="chevron-down" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
          {showLangPicker && (
            <View style={s.pickerMenu}>
              {LANGUAGE_OPTIONS.map(opt => (
                <TouchableOpacity key={opt.value} style={[s.pickerItem, language === opt.value && {backgroundColor: Colors.primary + '0D'}]} onPress={() => { setLanguage(opt.value); setShowLangPicker(false); }}>
                  <Text style={[s.pickerItemText, language === opt.value && {color: Colors.primary, fontWeight: FontWeights.bold}]}>{opt.label}</Text>
                  {language === opt.value && <Icon name="check" size={20} color={Colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Recording Storage */}
        <Text style={s.sectionLabel}>RECORDING STORAGE</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Custom Folder Path (Optional)</Text>
          <Text style={{...s.processDesc, fontSize: FontSizes.xs, color: Colors.textSecondary, marginBottom: 8}}>
            Use the Browse button to select your call recording folder, or paste a path manually below.
          </Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            {customPath ? (
              <View style={[s.input, {flex: 1, justifyContent: 'center'}]}>
                <Text style={{fontSize: FontSizes.body, color: Colors.textPrimary}} numberOfLines={1} ellipsizeMode="middle">{customPath}</Text>
              </View>
            ) : (
              <TextInput style={[s.input, {flex: 1}]} value={customPath} onChangeText={setCustomPath} placeholder="e.g. /storage/emulated/0/MyRecordings/" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
            )}
            <TouchableOpacity style={s.browseBtn} onPress={browseFolderPicker} activeOpacity={0.7}>
              <Icon name="folder-open-outline" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {customPath ? (
            <TouchableOpacity onPress={() => { setCustomPath(''); AsyncStorage.setItem('customScanPath', ''); if (NativeModules.RecordingMonitorModule?.setCustomScanPath) { NativeModules.RecordingMonitorModule.setCustomScanPath(''); } }} style={{marginTop: 8, alignSelf: 'flex-end'}}>
              <Text style={{fontSize: FontSizes.xs, color: Colors.error}}>Clear path</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Processing Status */}
        <Text style={s.sectionLabel}>PROCESSING</Text>
        <View style={s.card}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <View style={s.statusDot}/>
            <View style={{flex: 1, marginLeft: 12}}>
              <Text style={s.processTitle}>Auto-Processing Active</Text>
              <Text style={s.processDesc}>Recordings are automatically processed after each call</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={s.saveBtn} onPress={saveSettings} activeOpacity={0.7}>
          <Text style={s.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
          <Text style={s.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <CustomPopup {...popup} onClose={hidePopup}/>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  appBar: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingVertical: 14, elevation: 2},
  backBtn: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 8},
  backIcon: {fontSize: 20, color: Colors.textPrimary, fontWeight: FontWeights.bold},
  appBarTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},

  sectionLabel: {fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.primary, letterSpacing: 1.2, marginTop: Spacing.xxl, marginBottom: Spacing.sm, paddingLeft: 4},
  card: {backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 0.5, borderColor: Colors.divider},
  fieldLabel: {fontSize: FontSizes.sm, color: Colors.textMuted, fontWeight: FontWeights.medium, marginBottom: 8},
  input: {height: 50, backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.divider, paddingHorizontal: Spacing.lg, fontSize: FontSizes.body, color: Colors.textPrimary},
  browseBtn: {width: 50, height: 50, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center'},
  dropdown: {height: 50, backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.divider, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  dropdownText: {fontSize: FontSizes.body, color: Colors.textPrimary, fontWeight: FontWeights.medium},
  dropdownArrow: {fontSize: 12, color: Colors.textMuted},
  pickerMenu: {marginTop: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.divider, overflow: 'hidden'},
  pickerItem: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: Spacing.lg, borderBottomWidth: 0.5, borderBottomColor: Colors.divider},
  pickerItemText: {flex: 1, fontSize: FontSizes.body, color: Colors.textPrimary},
  pickerCheck: {fontSize: 16, color: Colors.primary, fontWeight: FontWeights.bold},
  statusDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.success},
  processTitle: {fontSize: FontSizes.body, fontWeight: FontWeights.semiBold, color: Colors.textPrimary},
  processDesc: {fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2},
  saveBtn: {backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.xxl},
  saveBtnText: {color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.bold},
  logoutBtn: {borderWidth: 1.5, borderColor: Colors.error + '4D', borderRadius: BorderRadius.lg, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.md},
  logoutBtnText: {color: Colors.error, fontSize: FontSizes.lg, fontWeight: FontWeights.bold},
});
