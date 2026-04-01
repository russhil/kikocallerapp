import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, AppState, Linking, Platform, NativeModules} from 'react-native';
import {PermissionsAndroid} from 'react-native';

const {RecordingMonitorModule} = NativeModules;
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const PERMISSIONS = [
  {key: 'READ_PHONE_STATE', label: 'Phone Access', desc: 'Detect call recordings'},
  {key: 'RECORD_AUDIO', label: 'Microphone', desc: 'Audio processing'},
  {key: 'READ_CONTACTS', label: 'Contacts', desc: 'Match caller names'},
  {key: 'READ_CALL_LOG', label: 'Call Log', desc: 'Match call details'},
];

function getPermissions() {
  const perms = PERMISSIONS.map(p => ({...p, perm: PermissionsAndroid.PERMISSIONS[p.key]}));
  if (Platform.Version >= 33) {
    perms.push({key: 'READ_MEDIA_AUDIO', label: 'Audio Files', desc: 'Access recordings', perm: PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO});
    perms.push({key: 'POST_NOTIFICATIONS', label: 'Notifications', desc: 'Processing updates', perm: PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS});
  } else if (Platform.Version < 30) {
    perms.push({key: 'READ_EXTERNAL_STORAGE', label: 'Storage', desc: 'Access recordings', perm: PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE});
  }
  return perms;
}

export default function PermissionScreen({onAllGranted}) {
  const [statuses, setStatuses] = useState({});
  const [allFilesAccess, setAllFilesAccess] = useState(Platform.Version < 30);
  const [checking, setChecking] = useState(true);
  const perms = getPermissions();

  const checkAll = useCallback(async () => {
    const result = {};
    for (const p of perms) {
      const granted = await PermissionsAndroid.check(p.perm);
      result[p.key] = granted;
    }
    
    let allFiles = true;
    if (Platform.Version >= 30) {
      try {
        allFiles = await RecordingMonitorModule.hasAllFilesAccess();
      } catch (e) {
        allFiles = false;
      }
    }
    
    setStatuses(result);
    setAllFilesAccess(allFiles);
    setChecking(false);
    
    if (Object.values(result).every(v => v) && allFiles) {
      onAllGranted?.();
    }
  }, [onAllGranted]);

  const requestAll = async () => {
    setChecking(true);
    try {
      const permsToRequest = perms.map(p => p.perm);
      await PermissionsAndroid.requestMultiple(permsToRequest);
    } catch (e) {}
    
    // Check and request All Files Access if needed
    if (Platform.Version >= 30) {
      try {
        const hasAccess = await RecordingMonitorModule.hasAllFilesAccess();
        if (!hasAccess) {
          await RecordingMonitorModule.requestAllFilesAccess();
        }
      } catch (e) {}
    }
    
    await checkAll();
  };

  useEffect(() => { requestAll(); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkAll();
    });
    return () => sub.remove();
  }, [checkAll]);

  const allGranted = Object.keys(statuses).length > 0 && Object.values(statuses).every(v => v) && allFilesAccess;
  if (allGranted) return null;

  const totalPerms = Platform.Version >= 30 ? perms.length + 1 : perms.length;
  const grantedCount = Object.values(statuses).filter(v => v).length + (Platform.Version >= 30 && allFilesAccess ? 1 : 0);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.inner}>
        {/* Header */}
        <View style={s.headerIcon}><Icon name="shield-alert" size={36} color={Colors.white} /></View>
        <Text style={s.title}>Permissions Required</Text>
        <Text style={s.subtitle}>Kiko AI needs these permissions to scan{'\n'}and process your call recordings</Text>

        {/* Progress */}
        <View style={s.progressBar}>
          <View style={[s.progressFill, {width: `${totalPerms > 0 ? (grantedCount / totalPerms) * 100 : 0}%`}]}/>
        </View>
        <Text style={s.progressText}>{grantedCount} of {totalPerms} granted</Text>

        {/* Permission list */}
        <View style={s.permList}>
          {perms.map(p => (
            <View key={p.key} style={s.permRow}>
              <View style={[s.permDot, {backgroundColor: statuses[p.key] ? Colors.success : Colors.error}]}/>
              <View style={{flex: 1, marginLeft: 12}}>
                <Text style={s.permLabel}>{p.label}</Text>
                <Text style={s.permDesc}>{p.desc}</Text>
              </View>
              <Text style={[s.permStatus, {color: statuses[p.key] ? Colors.success : Colors.error}]}>
                {statuses[p.key] ? 'Granted' : 'Required'}
              </Text>
            </View>
          ))}
          
          {Platform.Version >= 30 && (
            <View style={s.permRow}>
              <View style={[s.permDot, {backgroundColor: allFilesAccess ? Colors.success : Colors.error}]}/>
              <View style={{flex: 1, marginLeft: 12}}>
                <Text style={s.permLabel}>All Files Access</Text>
                <Text style={s.permDesc}>Needed on newer devices</Text>
              </View>
              <Text style={[s.permStatus, {color: allFilesAccess ? Colors.success : Colors.error}]}>
                {allFilesAccess ? 'Granted' : 'Required'}
              </Text>
            </View>
          )}
        </View>

        {/* Buttons */}
        <TouchableOpacity style={s.grantBtn} onPress={requestAll} activeOpacity={0.7}>
          <Text style={s.grantBtnText}>Grant All Permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.settingsBtn} onPress={() => Linking.openSettings()} activeOpacity={0.7}>
          <Text style={s.settingsBtnText}>Open App Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  inner: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl},

  headerIcon: {width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center'},
  headerIconText: {fontSize: 28, fontWeight: FontWeights.bold, color: Colors.white},
  title: {fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginTop: Spacing.xl},
  subtitle: {fontSize: FontSizes.body, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 22},

  progressBar: {width: '100%', height: 6, backgroundColor: Colors.divider, borderRadius: 3, marginTop: Spacing.xxl, overflow: 'hidden'},
  progressFill: {height: 6, backgroundColor: Colors.success, borderRadius: 3},
  progressText: {fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 6},

  permList: {width: '100%', marginTop: Spacing.xxl},
  permRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.divider},
  permDot: {width: 10, height: 10, borderRadius: 5},
  permLabel: {fontSize: FontSizes.body, fontWeight: FontWeights.medium, color: Colors.textPrimary},
  permDesc: {fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1},
  permStatus: {fontSize: FontSizes.sm, fontWeight: FontWeights.semiBold},

  grantBtn: {width: '100%', height: 52, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.xxl},
  grantBtnText: {color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.bold},
  settingsBtn: {width: '100%', height: 52, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.primary + '4D', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.md},
  settingsBtnText: {color: Colors.primary, fontSize: FontSizes.lg, fontWeight: FontWeights.semiBold},
});
