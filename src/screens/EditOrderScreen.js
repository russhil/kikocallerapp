import React, {useState, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRoute, useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {BASE_URL} from '../config';
import CustomPopup from '../components/CustomPopup';
import { trackOrderEdited } from '../utils/analytics';

export default function EditOrderScreen() {
  const route = useRoute();
  const nav = useNavigation();
  const {orderId} = route.params;
  const [order, setOrder] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [totalAmount, setTotalAmount] = useState('0');
  const [products, setProducts] = useState([]);
  const [popup, setPopup] = useState({visible: false, title: '', message: '', icon: 'info', buttons: []});

  const showPopup = (title, message, icon, buttons) => {
    setPopup({visible: true, title, message, icon: icon || 'info', buttons: buttons || [{text: 'OK', onPress: () => setPopup(p => ({...p, visible: false}))}]});
  };
  const hidePopup = () => setPopup(p => ({...p, visible: false}));

  useEffect(() => { loadOrder(); }, [orderId]);

  const loadOrder = async () => {
    const raw = await AsyncStorage.getItem('orders');
    const list = raw ? JSON.parse(raw) : [];
    const found = list.find(o => o.orderId === orderId);
    if (!found) return;
    setOrder(found);
    setCustomerName(found.customerName || '');
    setCustomerPhone(found.customerPhone || '');
    setAddress(found.address || '');
    setNotes(found.notes || '');
    setTotalAmount(found.totalAmount ? String(Math.round(found.totalAmount)) : '0');
    const prods = (found.products || []).map(p => ({
      name: p.name || '', quantity: p.quantity || '', price: p.price ? String(Math.round(p.price)) : '',
    }));
    if (prods.length === 0) prods.push({name: '', quantity: '', price: ''});
    setProducts(prods);
  };

  const addProduct = () => setProducts([...products, {name: '', quantity: '', price: ''}]);

  const removeProduct = (i) => {
    const updated = products.filter((_, idx) => idx !== i);
    setProducts(updated);
  };

  const updateProduct = (i, field, value) => {
    const updated = [...products];
    updated[i] = {...updated[i], [field]: value};
    setProducts(updated);
  };

  const recalcTotal = (prods) => {
    let total = 0;
    prods.forEach(p => {
      const price = parseFloat(p.price) || 0;
      const qty = parseFloat(p.quantity) || 1;
      total += price * qty;
    });
    if (total > 0) setTotalAmount(String(Math.round(total)));
  };

  const saveOrder = async () => {
    const productList = products.filter(p => p.name.trim()).map(p => ({
      name: p.name.trim(),
      quantity: p.quantity.trim() || '1',
      price: parseFloat(p.price) || 0,
    }));

    const raw = await AsyncStorage.getItem('orders');
    const list = raw ? JSON.parse(raw) : [];
    const updated = list.map(o => {
      if (o.orderId !== orderId) return o;
      return {
        ...o,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        products: productList,
        totalAmount: parseFloat(totalAmount) || 0,
      };
    });
    await AsyncStorage.setItem('orders', JSON.stringify(updated));

    try {
      const token = await AsyncStorage.getItem('authToken');
      const found = updated.find(o => o.orderId === orderId);
      if (token && found) {
        await fetch(`${BASE_URL}/api/sync/order`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
          body: JSON.stringify(found),
        });
      }
    } catch (e) {}

    showPopup('Saved', 'Order updated successfully!', 'check', [
      {text: 'OK', onPress: () => { hidePopup(); trackOrderEdited(orderId); nav.goBack(); }},
    ]);
  };

  if (!order) return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <Text style={{color: Colors.textMuted, fontSize: FontSizes.body}}>Loading...</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.appBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.appBarTitle}>Edit Order</Text>
        <View style={{flex: 1}}/>
        <TouchableOpacity style={s.saveHeaderBtn} onPress={saveOrder} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={s.saveHeaderText}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: Spacing.lg, paddingBottom: 40}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Field label="Customer Name" value={customerName} onChange={setCustomerName}/>
          <Field label="Customer Phone" value={customerPhone} onChange={setCustomerPhone} keyboard="phone-pad"/>
          <Field label="Delivery Address" value={address} onChange={setAddress} multiline/>
          <Field label="Notes" value={notes} onChange={setNotes} multiline/>

          <View style={s.productsHeader}>
            <Text style={s.sectionTitle}>Products</Text>
            <TouchableOpacity style={s.addBtnWrap} onPress={addProduct} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={s.addBtnText}>+ Add Product</Text>
            </TouchableOpacity>
          </View>

          {products.map((p, i) => (
            <View key={i} style={s.productRow}>
              <View style={s.productNum}><Text style={s.productNumText}>{i + 1}</Text></View>
              <View style={{flex: 1, marginLeft: 10}}>
                <TextInput style={s.productInput} value={p.name} onChangeText={v => updateProduct(i, 'name', v)} placeholder="Product name" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
                <View style={{flexDirection: 'row', marginTop: 6, gap: 8}}>
                  <TextInput style={[s.productInput, {flex: 1}]} value={p.quantity} onChangeText={v => updateProduct(i, 'quantity', v)} placeholder="Qty" placeholderTextColor={Colors.textMuted} keyboardType="numeric" maxFontSizeMultiplier={1.2}/>
                  <TextInput style={[s.productInput, {flex: 2}]} value={p.price} onChangeText={v => updateProduct(i, 'price', v)} placeholder="₹ Price" placeholderTextColor={Colors.textMuted} keyboardType="numeric" maxFontSizeMultiplier={1.2}/>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeProduct(i)} style={s.removeBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Text style={s.removeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          <Field label="Total Amount (₹)" value={totalAmount} onChange={setTotalAmount} keyboard="numeric" bold/>

          <TouchableOpacity style={s.saveBtn} onPress={saveOrder} activeOpacity={0.7}>
            <Text style={s.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomPopup {...popup} onClose={hidePopup}/>
    </SafeAreaView>
  );
}

function Field({label, value, onChange, multiline, keyboard, bold}) {
  return (
    <View style={{marginBottom: Spacing.lg}}>
      <Text style={{fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: Spacing.xs, fontWeight: FontWeights.medium}}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, multiline && {height: 80, textAlignVertical: 'top'}, bold && {fontWeight: FontWeights.bold, fontSize: FontSizes.xl}]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboard || 'default'}
        placeholderTextColor={Colors.textMuted}
        maxFontSizeMultiplier={1.2}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  input: {height: 50, backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.divider, paddingHorizontal: Spacing.lg, fontSize: FontSizes.body, color: Colors.textPrimary},
});

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  appBar: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingVertical: 14, elevation: 2},
  backBtn: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 8},
  backIcon: {fontSize: 20, color: Colors.textPrimary, fontWeight: FontWeights.bold},
  appBarTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  saveHeaderBtn: {backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: 18, paddingVertical: 9},
  saveHeaderText: {fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.white},

  productsHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md},
  sectionTitle: {fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  addBtnWrap: {backgroundColor: Colors.primary + '14', borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 7},
  addBtnText: {fontSize: FontSizes.sm, color: Colors.primary, fontWeight: FontWeights.bold},

  productRow: {flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, borderWidth: 0.5, borderColor: Colors.divider, padding: Spacing.md, marginBottom: Spacing.sm},
  productNum: {width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + '14', justifyContent: 'center', alignItems: 'center', marginTop: 10},
  productNumText: {fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.primary},
  productInput: {height: 44, backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: Spacing.md, fontSize: FontSizes.body, color: Colors.textPrimary},
  removeBtn: {width: 36, height: 36, borderRadius: BorderRadius.md, backgroundColor: Colors.error + '10', justifyContent: 'center', alignItems: 'center', marginLeft: 8, marginTop: 6},
  removeBtnText: {fontSize: 20, fontWeight: FontWeights.bold, color: Colors.error},

  saveBtn: {backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.xxl},
  saveBtnText: {color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.bold},
});
