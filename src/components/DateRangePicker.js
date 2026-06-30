import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  Colors,
  FontSizes,
  FontWeights,
  BorderRadius,
  Spacing,
} from '../theme';
import { useLang } from '../i18n/LanguageContext';

const toKey = d => {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
};
const startOfDayMs = key => new Date(`${key}T00:00:00`).getTime();
const endOfDayMs = key => new Date(`${key}T23:59:59.999`).getTime();

export default function DateRangePicker({
  visible,
  initial,
  onClose,
  onApply,
}) {
  const { t } = useLang();
  const [start, setStart] = useState(null); // 'YYYY-MM-DD'
  const [end, setEnd] = useState(null);

  useEffect(() => {
    if (visible) {
      setStart(initial && initial.start ? toKey(initial.start) : null);
      setEnd(initial && initial.end ? toKey(initial.end) : null);
    }
  }, [visible, initial]);

  const onDayPress = day => {
    const k = day.dateString;
    if (!start || (start && end)) {
      setStart(k);
      setEnd(null);
    } else {
      // start set, end not set
      if (k < start) {
        setEnd(start);
        setStart(k);
      } else {
        setEnd(k);
      }
    }
  };

  const applyPreset = preset => {
    const now = new Date();
    const todayKey = toKey(now);
    let sKey = todayKey;
    if (preset === 'today') {
      sKey = todayKey;
    } else if (preset === 'last7') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      sKey = toKey(d);
    } else if (preset === 'last30') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      sKey = toKey(d);
    } else if (preset === 'thisMonth') {
      sKey = toKey(new Date(now.getFullYear(), now.getMonth(), 1));
    } else if (preset === 'all') {
      onApply(null);
      return;
    }
    onApply({ start: startOfDayMs(sKey), end: endOfDayMs(todayKey) });
  };

  const buildMarked = () => {
    if (!start) return {};
    const marks = {};
    if (!end) {
      marks[start] = {
        startingDay: true,
        endingDay: true,
        color: Colors.primary,
        textColor: '#fff',
      };
      return marks;
    }
    let cur = new Date(`${start}T00:00:00`);
    const last = new Date(`${end}T00:00:00`);
    while (cur <= last) {
      const key = toKey(cur);
      marks[key] = {
        color: Colors.primary + '33',
        textColor: Colors.textPrimary,
      };
      cur.setDate(cur.getDate() + 1);
    }
    marks[start] = {
      startingDay: true,
      color: Colors.primary,
      textColor: '#fff',
    };
    marks[end] = { endingDay: true, color: Colors.primary, textColor: '#fff' };
    return marks;
  };

  const onApplyCustom = () => {
    if (start) {
      const e = end || start;
      onApply({ start: startOfDayMs(start), end: endOfDayMs(e) });
    } else {
      onApply(null);
    }
  };

  const presets = [
    { key: 'today', label: t('date.today') },
    { key: 'last7', label: t('date.last7') },
    { key: 'last30', label: t('date.last30') },
    { key: 'thisMonth', label: t('date.thisMonth') },
    { key: 'all', label: t('date.all') },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>{t('date.title')}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.presetRow}>
              {presets.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={s.preset}
                  onPress={() => applyPreset(p.key)}
                  activeOpacity={0.7}
                >
                  <Text style={s.presetText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.hint}>{t('date.selectRange')}</Text>
            <Calendar
              markingType="period"
              markedDates={buildMarked()}
              onDayPress={onDayPress}
              maxDate={toKey(new Date())}
              theme={{
                todayTextColor: Colors.primary,
                arrowColor: Colors.primary,
                textDayFontWeight: '500',
              }}
            />
          </ScrollView>

          <View style={s.actions}>
            <TouchableOpacity
              style={s.clearBtn}
              onPress={() => onApply(null)}
              activeOpacity={0.7}
            >
              <Text style={s.clearText}>{t('date.clear')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.applyBtn}
              onPress={onApplyCustom}
              activeOpacity={0.7}
            >
              <Text style={s.applyText}>{t('date.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  preset: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full || 999,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  presetText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeights.semiBold,
  },
  hint: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  clearBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearText: {
    fontSize: FontSizes.body,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: {
    fontSize: FontSizes.body,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
});
