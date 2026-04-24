import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRoute, useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import {sendWhatsApp, shareOrderViaWhatsApp, composeMessage, formatPrice, formatProductPrice} from '../utils/whatsappHelper';
import CustomPopup from '../components/CustomPopup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {syncOrder} from '../api/syncApi';
import {
  trackWhatsappSent,
  trackWhatsappShared,
  trackOrderCancelled,
  trackOrderRestored,
  trackOrderDelivered,
  trackButtonClick,
} from '../utils/analytics';

export default function OrderDetailScreen() {
  const route = useRoute();
  const nav = useNavigation();
  const {orderId} = route.params;
  const [order, setOrder] = useState(null);
  const [popup, setPopup] = useState({visible: false, title: '', message: '', icon: 'info', buttons: []});

  const showPopup = (title, message, icon, buttons) => {
    setPopup({visible: true, title, message, icon: icon || 'info', buttons: buttons || [{text: 'OK', onPress: () => setPopup(p => ({...p, visible: false}))}]});
  };
  const hidePopup = () => setPopup(p => ({...p, visible: false}));

  const loadOrder = async () => {
    try {
      const raw = await AsyncStorage.getItem('orders');
      const list = raw ? JSON.parse(raw) : [];
      const found = list.find(o => o.orderId === orderId);
      setOrder(found);
    } catch (e) {}
  };

  useEffect(() => { loadOrder(); }, [orderId]);
  useEffect(() => {
    const unsub = nav.addListener('focus', loadOrder);
    return unsub;
  }, [nav]);

  const saveOrders = async (updater) => {
    const raw = await AsyncStorage.getItem('orders');
    const list = raw ? JSON.parse(raw) : [];
    const updated = updater(list);
    await AsyncStorage.setItem('orders', JSON.stringify(updated));
    const found = updated.find(o => o.orderId === orderId);
    setOrder(found);

    // Sync to backend if token is available
    if (found) {
        try {
            const tk = await AsyncStorage.getItem('auth_token');
            if (tk) await syncOrder(found, null, tk);
        } catch(e) { console.warn('Sync failed', e); }
    }
  };

  const cancelOrder = () => {
    showPopup('Cancel Order', 'Are you sure you want to cancel this order?', 'warning', [
      {text: 'No', style: 'outline', onPress: hidePopup},
      {text: 'Cancel Order', style: 'destructive', onPress: () => {
        hidePopup();
        trackOrderCancelled(orderId);
        saveOrders(list => list.map(o => o.orderId === orderId ? {...o, isCancelled: true, cancelledAt: Date.now(), deliveryStatus: 'cancelled'} : o));
      }},
    ]);
  };

  const markDelivered = () => {
    showPopup('Mark Delivered', 'Confirm this order is delivered?', 'info', [
      {text: 'No', style: 'outline', onPress: hidePopup},
      {text: 'Yes, Delivered', style: 'primary', onPress: () => {
        hidePopup();
        trackOrderDelivered(orderId);
        saveOrders(list => list.map(o => o.orderId === orderId ? {...o, deliveryStatus: 'delivered', isCancelled: false, cancelledAt: null} : o));
      }},
    ]);
  };

  const restoreOrder = () => {
    trackOrderRestored(orderId);
    saveOrders(list => list.map(o => o.orderId === orderId ? {...o, isCancelled: false, cancelledAt: null, deliveryStatus: 'pending'} : o));
  };

  const whatsAppSend = async () => {
    try {
      await sendWhatsApp(order);
      trackWhatsappSent(orderId);
      await saveOrders(list => list.map(o => o.orderId === orderId ? {...o, whatsappSent: true} : o));
      showPopup('Sent', 'Order sent via WhatsApp!', 'check');
    } catch (e) {
      showPopup('Error', 'Could not open WhatsApp', 'error');
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${h}:${m} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
  };

  if (!order) return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <Text style={{color: Colors.textMuted, fontSize: FontSizes.body}}>Loading...</Text>
      </View>
    </SafeAreaView>
  );

  const products = order.products || [];
  const message = composeMessage(order);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* AppBar */}
      <View style={s.appBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.appBarTitle}>Order Details</Text>
        <View style={{flex: 1}}/>
        <TouchableOpacity style={s.editHeaderBtn} onPress={() => nav.navigate('EditOrder', {orderId})} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={s.editHeaderText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: Spacing.lg, paddingBottom: 40}} showsVerticalScrollIndicator={false}>
        {/* Order Header Card */}
        <View style={s.headerCard}>
          <View style={s.headerRow}>
            <Text style={s.headerId}>#{order.orderId}</Text>
            {order.isCancelled && <View style={s.cancelBadge}><Text style={s.cancelBadgeText}>Cancelled</Text></View>}
          </View>
          <Text style={s.headerDate}>{formatDate(order.createdAt)}</Text>

          <View style={s.divider}/>

          {order.customerName ? <InfoRow label="Customer" value={order.customerName}/> : null}
          <InfoRow label="Phone" value={order.customerPhone || 'Not available'}/>
          {order.storeName ? <InfoRow label="Store" value={order.storeName}/> : null}
          {order.address ? <InfoRow label="Address" value={order.address}/> : null}
        </View>

        {/* Products */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Products ({products.length})</Text>
          {products.map((p, i) => (
            <View key={i} style={s.productRow}>
              <View style={s.productNum}><Text style={s.productNumText}>{i + 1}</Text></View>
              <Text style={s.productName}>{p.name}</Text>
              <Text style={s.productQty}>× {p.quantity}</Text>
              {p.price ? <Text style={s.productPrice}>{formatProductPrice(p.price)}</Text> : null}
            </View>
          ))}
          {order.totalAmount ? (
            <>
              <View style={s.totalDivider}/>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalValue}>{formatPrice(order.totalAmount)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Notes */}
        {order.notes ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={s.notesText}>{order.notes}</Text>
          </View>
        ) : null}

        {/* WhatsApp Preview */}
        <View style={s.waPreview}>
          <Text style={s.waPreviewTitle}>WhatsApp Message Preview</Text>
          <Text style={s.waPreviewText}>{message}</Text>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity style={s.waBtn} onPress={whatsAppSend} activeOpacity={0.7}>
          <Text style={s.waBtnText}>{order.whatsappSent ? 'Resend via WhatsApp' : 'Send via WhatsApp'}</Text>
        </TouchableOpacity>

        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={() => nav.navigate('EditOrder', {orderId})} activeOpacity={0.7}>
            <Text style={s.actionBtnText}>Edit Order</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => { trackWhatsappShared(orderId); shareOrderViaWhatsApp(order); }} activeOpacity={0.7}>
            <Text style={s.actionBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.dangerBtn, {borderColor: order.isCancelled ? Colors.success : Colors.error}]}
          onPress={order.isCancelled ? restoreOrder : cancelOrder}
          activeOpacity={0.7}
        >
          <Text style={[s.dangerBtnText, {color: order.isCancelled ? Colors.success : Colors.error}]}>
            {order.isCancelled ? 'Restore Order' : 'Cancel Order'}
          </Text>
        </TouchableOpacity>

        {(!order.isCancelled && order.deliveryStatus !== 'delivered') && (
          <TouchableOpacity
            style={[s.actionBtn, {backgroundColor: Colors.success, borderColor: Colors.success, marginTop: Spacing.sm}]}
            onPress={markDelivered}
            activeOpacity={0.7}
          >
            <Text style={[s.actionBtnText, {color: '#fff'}]}>
              Mark as Delivered
            </Text>
          </TouchableOpacity>
        )}
        
        {order.deliveryStatus === 'delivered' && (
           <View style={{marginTop: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.success+'20', borderRadius: BorderRadius.md, alignItems: 'center'}}>
              <Text style={{color: Colors.success, fontWeight: FontWeights.bold}}>Order Delivered</Text>
           </View>
        )}
      </ScrollView>

      <CustomPopup {...popup} onClose={hidePopup}/>
    </SafeAreaView>
  );
}

function InfoRow({label, value}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8}}>
      <Text style={{fontSize: FontSizes.sm, color: Colors.textMuted, width: 80}}>{label}</Text>
      <Text style={{fontSize: FontSizes.body, color: Colors.textPrimary, flex: 1, fontWeight: FontWeights.medium}}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  appBar: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingVertical: 14, elevation: 2},
  backBtn: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 8},
  backIcon: {fontSize: 20, color: Colors.textPrimary, fontWeight: FontWeights.bold},
  appBarTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  editHeaderBtn: {backgroundColor: Colors.primary + '14', borderRadius: BorderRadius.md, paddingHorizontal: 16, paddingVertical: 8},
  editHeaderText: {fontSize: FontSizes.sm, fontWeight: FontWeights.semiBold, color: Colors.primary},

  headerCard: {backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.xl, borderWidth: 0.5, borderColor: Colors.divider},
  headerRow: {flexDirection: 'row', alignItems: 'center'},
  headerId: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.primary, flex: 1},
  cancelBadge: {backgroundColor: Colors.error + '14', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8},
  cancelBadgeText: {fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.error},
  headerDate: {fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: Spacing.md, marginTop: 4},
  divider: {height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md},

  section: {backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 0.5, borderColor: Colors.divider, marginTop: Spacing.lg},
  sectionTitle: {fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginBottom: Spacing.md},
  productRow: {flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, paddingVertical: 4},
  productNum: {width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primary + '14', justifyContent: 'center', alignItems: 'center'},
  productNumText: {fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.primary},
  productName: {flex: 1, fontSize: FontSizes.body, color: Colors.textPrimary, marginLeft: 12},
  productQty: {fontSize: FontSizes.sm, color: Colors.textSecondary},
  productPrice: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginLeft: Spacing.md, minWidth: 60, textAlign: 'right'},
  totalDivider: {height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm},
  totalRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs, paddingVertical: 4},
  totalLabel: {fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  totalValue: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.primary},
  notesText: {fontSize: FontSizes.body, color: Colors.textSecondary, lineHeight: 22},

  waPreview: {backgroundColor: Colors.whatsapp + '0A', borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.whatsapp + '26', marginTop: Spacing.lg},
  waPreviewTitle: {fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.whatsapp, marginBottom: Spacing.sm},
  waPreviewText: {fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20},

  waBtn: {backgroundColor: Colors.whatsapp, borderRadius: BorderRadius.lg, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.xxl},
  waBtnText: {color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.bold},

  actionRow: {flexDirection: 'row', marginTop: Spacing.md, gap: 10},
  actionBtn: {flex: 1, borderWidth: 1.5, borderColor: Colors.primary + '4D', borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center'},
  actionBtnText: {color: Colors.primary, fontSize: FontSizes.body, fontWeight: FontWeights.bold},

  dangerBtn: {borderWidth: 1.5, borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md},
  dangerBtnText: {fontSize: FontSizes.body, fontWeight: FontWeights.bold},
});
