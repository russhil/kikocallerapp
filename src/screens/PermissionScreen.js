import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Linking,
  Platform,
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import { PermissionsAndroid } from 'react-native';

const { RecordingMonitorModule } = NativeModules;
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Colors,
  FontSizes,
  FontWeights,
  BorderRadius,
  Spacing,
} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  trackPermissionScreenViewed,
  trackPermissionsGranted,
} from '../utils/analytics';
import { useLang } from '../i18n/LanguageContext';

// PERMISSIONS is defined at module scope, so we store i18n KEYS here and
// resolve them with t(...) inside the component's render.
const PERMISSIONS = [
  {
    key: 'READ_CONTACTS',
    labelKey: 'permission.contactsLabel',
    descKey: 'permission.contactsDesc',
  },
  {
    key: 'READ_PHONE_STATE',
    labelKey: 'permission.phoneStateLabel',
    descKey: 'permission.phoneStateDesc',
  },
];

function getPermissions() {
  const perms = PERMISSIONS.map(p => ({
    ...p,
    perm: PermissionsAndroid.PERMISSIONS[p.key],
  }));
  if (Platform.Version >= 33) {
    perms.push({
      key: 'READ_MEDIA_AUDIO',
      labelKey: 'permission.audioLabel',
      descKey: 'permission.audioDesc',
      perm: PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
    });
    perms.push({
      key: 'POST_NOTIFICATIONS',
      labelKey: 'permission.notificationsLabel',
      descKey: 'permission.notificationsDesc',
      perm: PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    });
  } else if (Platform.Version < 30) {
    perms.push({
      key: 'READ_EXTERNAL_STORAGE',
      labelKey: 'permission.storageLabel',
      descKey: 'permission.storageDesc',
      perm: PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    });
  }
  return perms;
}

const ROLE_SUPPORTED = Platform.OS === 'android' && Platform.Version >= 29;

export default function PermissionScreen({ onAllGranted }) {
  const { t } = useLang();
  const [statuses, setStatuses] = useState({});
  const [hasRole, setHasRole] = useState(!ROLE_SUPPORTED);
  const [roleAvailable, setRoleAvailable] = useState(ROLE_SUPPORTED);
  const [checking, setChecking] = useState(true);
  const perms = getPermissions();

  const checkAll = useCallback(async () => {
    const result = {};
    for (const p of perms) {
      const granted = await PermissionsAndroid.check(p.perm);
      result[p.key] = granted;
    }

    let roleHeld = !ROLE_SUPPORTED;
    let roleAvail = ROLE_SUPPORTED;
    if (ROLE_SUPPORTED) {
      try {
        roleHeld = await RecordingMonitorModule.hasCallScreeningRole();
      } catch (e) {
        roleHeld = false;
      }
      try {
        roleAvail = await RecordingMonitorModule.isCallScreeningRoleAvailable();
      } catch (e) {
        roleAvail = false;
      }
    }

    setStatuses(result);
    setHasRole(roleHeld);
    setRoleAvailable(roleAvail);
    setChecking(false);
  }, []);

  // Track permission screen view on mount
  useEffect(() => {
    trackPermissionScreenViewed();
  }, []);

  // Auto-prompt the standard runtime permissions (system dialogs appear
  // automatically). Caller ID is handled separately via its manual button.
  const requestRuntime = async () => {
    try {
      await PermissionsAndroid.requestMultiple(perms.map(p => p.perm));
    } catch (e) {}
    await checkAll();
  };

  const requestRole = async () => {
    if (!ROLE_SUPPORTED) return;
    try {
      await RecordingMonitorModule.requestCallScreeningRole();
    } catch (e) {}
  };

  useEffect(() => {
    requestRuntime();
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkAll();
    });
    return () => sub.remove();
  }, [checkAll]);

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      'kikoScreeningRoleResult',
      () => {
        checkAll();
      },
    );
    return () => listener.remove();
  }, [checkAll]);

  const runtimeGranted =
    Object.keys(statuses).length > 0 && Object.values(statuses).every(v => v);
  const roleGate = !ROLE_SUPPORTED || !roleAvailable || hasRole;
  const allGranted = runtimeGranted && roleGate;

  const onContinue = () => {
    if (!allGranted) return;
    trackPermissionsGranted();
    onAllGranted?.();
  };

  const showRoleRow = ROLE_SUPPORTED && roleAvailable;
  let totalPerms = perms.length;
  if (showRoleRow) totalPerms += 1;

  let grantedCount = Object.values(statuses).filter(v => v).length;
  if (showRoleRow && hasRole) grantedCount += 1;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.inner}>
        {/* Header */}
        <View style={s.headerIcon}>
          <Icon name="shield-alert" size={36} color={Colors.white} />
        </View>
        <Text style={s.title}>{t('permission.title')}</Text>
        <Text style={s.subtitle}>{t('permission.subtitle')}</Text>

        {/* Progress */}
        <View style={s.progressBar}>
          <View
            style={[
              s.progressFill,
              {
                width: `${
                  totalPerms > 0 ? (grantedCount / totalPerms) * 100 : 0
                }%`,
              },
            ]}
          />
        </View>
        <Text style={s.progressText}>
          {t('permission.progress', {
            granted: grantedCount,
            total: totalPerms,
          })}
        </Text>

        {/* Permission list */}
        <View style={s.permList}>
          {perms.map(p => (
            <View key={p.key} style={s.permRow}>
              <View
                style={[
                  s.permDot,
                  {
                    backgroundColor: statuses[p.key]
                      ? Colors.success
                      : Colors.error,
                  },
                ]}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.permLabel}>{t(p.labelKey)}</Text>
                <Text style={s.permDesc}>{t(p.descKey)}</Text>
              </View>
              {statuses[p.key] ? (
                <View style={s.statusGranted}>
                  <Icon name="check-circle" size={18} color={Colors.success} />
                  <Text style={s.grantedText}>{t('permission.granted')}</Text>
                </View>
              ) : (
                <Text style={[s.permStatus, { color: Colors.error }]}>
                  {t('permission.required')}
                </Text>
              )}
            </View>
          ))}

          {showRoleRow && (
            <View style={s.permRow}>
              <View
                style={[
                  s.permDot,
                  {
                    backgroundColor: hasRole ? Colors.success : Colors.error,
                  },
                ]}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.permLabel}>{t('permission.callerIdLabel')}</Text>
                <Text style={s.permDesc}>{t('permission.callerIdDesc')}</Text>
              </View>
              {hasRole ? (
                <View style={s.statusGranted}>
                  <Icon name="check-circle" size={18} color={Colors.success} />
                  <Text style={s.grantedText}>{t('permission.granted')}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.allowBtn}
                  onPress={requestRole}
                  activeOpacity={0.7}
                >
                  <Text style={s.allowBtnText}>{t('permission.allow')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Continue — enabled only once everything is allowed */}
        <TouchableOpacity
          style={[s.continueBtn, !allGranted && s.continueBtnDisabled]}
          onPress={onContinue}
          disabled={!allGranted}
          activeOpacity={0.7}
        >
          <Text
            style={[
              s.continueBtnText,
              !allGranted && s.continueBtnTextDisabled,
            ]}
          >
            {t('permission.continue')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.settingsBtn}
          onPress={() => Linking.openSettings()}
          activeOpacity={0.7}
        >
          <Text style={s.settingsBtnText}>
            {t('permission.openSettingsButton')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },

  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.xl,
  },
  subtitle: {
    fontSize: FontSizes.body,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },

  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.divider,
    borderRadius: 3,
    marginTop: Spacing.xxl,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: Colors.success, borderRadius: 3 },
  progressText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 6,
  },

  permList: { width: '100%', marginTop: Spacing.xxl },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.divider,
  },
  permDot: { width: 10, height: 10, borderRadius: 5 },
  permLabel: {
    fontSize: FontSizes.body,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
  },
  permDesc: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1 },
  permStatus: { fontSize: FontSizes.sm, fontWeight: FontWeights.semiBold },

  // Per-row Allow button + Granted state
  allowBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  allowBtnText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  statusGranted: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grantedText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semiBold,
    color: Colors.success,
  },

  // Continue button (greyed until everything allowed)
  continueBtn: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  continueBtnDisabled: { backgroundColor: Colors.divider },
  continueBtnText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  continueBtnTextDisabled: { color: Colors.textMuted },

  grantBtn: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  grantBtnText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  settingsBtn: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary + '4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  settingsBtnText: {
    color: Colors.primary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semiBold,
  },
});
