import React from 'react';
import {View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions} from 'react-native';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width} = Dimensions.get('window');

/**
 * Custom styled popup to replace system Alert.alert()
 * 
 * Usage:
 *   <CustomPopup
 *     visible={showPopup}
 *     title="Success"
 *     message="Order created!"
 *     icon="check"   // 'check' | 'error' | 'warning' | 'info' | 'question'
 *     buttons={[
 *       {text: 'Cancel', style: 'outline', onPress: () => setShowPopup(false)},
 *       {text: 'OK', onPress: () => { setShowPopup(false); doSomething(); }},
 *     ]}
 *     onClose={() => setShowPopup(false)}
 *   />
 */
export default function CustomPopup({visible, title, message, icon, buttons, onClose}) {
  if (!visible) return null;

  const iconConfig = {
    check: {bg: Colors.success + '1A', color: Colors.success, name: 'check-circle'},
    error: {bg: Colors.error + '1A', color: Colors.error, name: 'alert-circle'},
    warning: {bg: Colors.warning + '1A', color: Colors.warning, name: 'alert'},
    info: {bg: Colors.primary + '1A', color: Colors.primary, name: 'information'},
    question: {bg: Colors.primary + '1A', color: Colors.primary, name: 'help-circle'},
  };
  const ic = iconConfig[icon] || iconConfig.info;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.card} activeOpacity={1}>
          {/* Icon */}
          <View style={[s.iconCircle, {backgroundColor: ic.bg}]}>
            <Icon name={ic.name} size={28} color={ic.color} />
          </View>

          {/* Title */}
          {title ? <Text style={s.title}>{title}</Text> : null}

          {/* Message */}
          {message ? <Text style={s.message}>{message}</Text> : null}

          {/* Buttons */}
          <View style={s.btnRow}>
            {(buttons || [{text: 'OK', onPress: onClose}]).map((btn, i) => {
              const btnCount = (buttons || [{text: 'OK'}]).length;
              return (
              <TouchableOpacity
                key={i}
                style={[
                  s.btn,
                  btn.style === 'outline' ? s.btnOutline : s.btnFilled,
                  btn.style === 'destructive' && {backgroundColor: Colors.error},
                  btnCount === 1 ? {flex: 1} : {flex: 1, marginHorizontal: 4},
                ]}
                onPress={btn.onPress || onClose}
                activeOpacity={0.7}
              >
                <Text style={[
                  s.btnText,
                  btn.style === 'outline' ? s.btnTextOutline : s.btnTextFilled,
                  btn.style === 'destructive' && {color: Colors.white},
                ]}>{btn.text}</Text>
              </TouchableOpacity>
            );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl},
  card: {width: Math.min(width - 48, 380), backgroundColor: Colors.surface, borderRadius: BorderRadius.xxl, padding: Spacing.xxl, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: {width: 0, height: 8}},
  iconCircle: {width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg},
  iconChar: {fontSize: 26, fontWeight: FontWeights.bold},
  title: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm},
  message: {fontSize: FontSizes.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl},
  btnRow: {flexDirection: 'row', width: '100%'},
  btn: {height: 48, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center', minWidth: 100},
  btnFilled: {backgroundColor: Colors.primary},
  btnOutline: {backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary + '4D'},
  btnText: {fontSize: FontSizes.body, fontWeight: FontWeights.semiBold},
  btnTextFilled: {color: Colors.white},
  btnTextOutline: {color: Colors.primary},
});
