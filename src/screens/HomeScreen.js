import React, {useState, useEffect, useContext, useCallback} from 'react';
import {View, Text, TextInput, TouchableOpacity, FlatList, RefreshControl, StyleSheet, Dimensions, NativeModules, Image} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import {AuthContext} from '../context/AuthContext';
import {formatPrice, sendWhatsApp} from '../utils/whatsappHelper';
import CustomPopup from '../components/CustomPopup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width} = Dimensions.get('window');
const {RecordingMonitorModule} = NativeModules;

export default function HomeScreen() {
  const nav = useNavigation();
  const {logout} = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('dateDesc');
  const [loading, setLoading] = useState(false);
  const [showSort, setShowSort] = useState(false);
  // Custom popup state
  const [popup, setPopup] = useState({visible: false, title: '', message: '', icon: 'info', buttons: []});

  const showPopup = (title, message, icon, buttons) => {
    setPopup({visible: true, title, message, icon: icon || 'info', buttons: buttons || [{text: 'OK', onPress: () => setPopup(p => ({...p, visible: false}))}]});
  };
  const hidePopup = () => setPopup(p => ({...p, visible: false}));

  const loadOrders = async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem('orders');
      const list = raw ? JSON.parse(raw) : [];
      setOrders(list);
    } catch (e) {
      console.log('Load orders error:', e);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { loadOrders(); }, []));

  useEffect(() => {
    let list = [...orders];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').toLowerCase().includes(q) ||
        (o.orderId || '').toLowerCase().includes(q) ||
        (o.storeName || '').toLowerCase().includes(q)
      );
    }
    switch (sortMode) {
      case 'amountDesc': list.sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0)); break;
      case 'amountAsc': list.sort((a, b) => (a.totalAmount || 0) - (b.totalAmount || 0)); break;
      case 'cancelledOnly': list = list.filter(o => o.isCancelled); list.sort((a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0)); break;
      default: list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); break;
    }
    setFiltered(list);
  }, [orders, search, sortMode]);

  const saveOrders = async (list) => {
    await AsyncStorage.setItem('orders', JSON.stringify(list));
    setOrders(list);
  };

  const cancelOrder = async (orderId) => {
    const updated = orders.map(o => o.orderId === orderId ? {...o, isCancelled: true, cancelledAt: Date.now()} : o);
    await saveOrders(updated);
  };

  const restoreOrder = async (orderId) => {
    const updated = orders.map(o => o.orderId === orderId ? {...o, isCancelled: false, cancelledAt: null} : o);
    await saveOrders(updated);
  };

  const markAsRead = async (orderId) => {
    const updated = orders.map(o => o.orderId === orderId ? {...o, isRead: true} : o);
    await saveOrders(updated);
  };

  const handleLongPress = (order) => {
    if (order.isCancelled) {
      showPopup('Restore Order', 'Do you want to restore this cancelled order?', 'question', [
        {text: 'No', style: 'outline', onPress: hidePopup},
        {text: 'Restore', onPress: () => { hidePopup(); restoreOrder(order.orderId); }},
      ]);
    } else {
      showPopup('Cancel Order', 'Are you sure you want to cancel this order?', 'warning', [
        {text: 'No', style: 'outline', onPress: hidePopup},
        {text: 'Cancel Order', style: 'destructive', onPress: () => { hidePopup(); cancelOrder(order.orderId); }},
      ]);
    }
  };

  const handleWhatsApp = async (order) => {
    try {
      await sendWhatsApp(order);
      const updated = orders.map(o => o.orderId === order.orderId ? {...o, whatsappSent: true} : o);
      await saveOrders(updated);
    } catch (e) {
      showPopup('Error', 'Could not open WhatsApp', 'error');
    }
  };

  const showLogout = () => {
    showPopup('Logout', 'Are you sure you want to logout?', 'question', [
      {text: 'Cancel', style: 'outline', onPress: hidePopup},
      {text: 'Logout', style: 'destructive', onPress: () => { hidePopup(); logout(); }},
    ]);
  };

  const sortOptions = [
    {key: 'dateDesc', label: 'Latest First', icon: 'clock-outline'},
    {key: 'amountDesc', label: 'Amount: High → Low', icon: 'sort-numeric-descending'},
    {key: 'amountAsc', label: 'Amount: Low → High', icon: 'sort-numeric-ascending'},
    {key: 'cancelledOnly', label: 'Cancelled Orders', icon: 'cancel'},
  ];

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `${d.getDate()} ${months[d.getMonth()]}, ${h}:${m} ${ampm}`;
  };

  const renderOrder = ({item: order}) => {
    const products = order.products || [];
    const names = products.slice(0, 3).map(p => p.name).filter(Boolean).join(', ');
    const more = products.length > 3 ? ` +${products.length - 3} more` : '';

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => { markAsRead(order.orderId); nav.navigate('OrderDetail', {orderId: order.orderId}); }}
        onLongPress={() => handleLongPress(order)}
        activeOpacity={0.7}
      >
        {/* Header row */}
        <View style={s.cardHeader}>
          <View style={s.cardHeaderLeft}>
            {!order.isRead && <View style={s.unreadDot}/>}
            <Text style={[s.orderId, order.isCancelled && s.strike]}>#{order.orderId}</Text>
            {order.isCancelled && (
              <View style={s.cancelBadge}><Text style={s.cancelBadgeText}>Cancelled</Text></View>
            )}
          </View>
          <Text style={s.dateText}>{formatDate(order.createdAt)}</Text>
        </View>

        {/* Customer info */}
        {(order.customerName || order.customerPhone) && (
          <View style={s.customerRow}>
            <View style={s.customerIcon}><Icon name="account" size={20} color={Colors.primary} /></View>
            <View style={{flex: 1, marginLeft: 10}}>
              {order.customerName ? <Text style={[s.custName, order.isCancelled && s.strike]} numberOfLines={1}>{order.customerName}</Text> : null}
              {order.customerPhone ? <Text style={s.custPhone}>{order.customerPhone}</Text> : null}
            </View>
          </View>
        )}

        {/* Products */}
        {names ? (
          <View style={s.productBox}>
            <Text style={s.productText} numberOfLines={1}>{names}{more}</Text>
            <Text style={s.productCount}>{products.length} item{products.length > 1 ? 's' : ''}</Text>
          </View>
        ) : null}

        {/* Footer: Total + WhatsApp */}
        <View style={s.cardFooter}>
          {order.totalAmount ? (
            <View style={s.totalBadge}>
              <Text style={s.totalText}>{formatPrice(order.totalAmount)}</Text>
            </View>
          ) : <View/>}
          <View style={{flex: 1}}/>
          {order.whatsappSent && (
            <View style={s.sentBadge}><Text style={s.sentBadgeText}>Sent</Text></View>
          )}
          <TouchableOpacity style={s.waBtn} onPress={() => handleWhatsApp(order)} activeOpacity={0.7} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Text style={s.waBtnText}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* AppBar */}
      <View style={s.appBar}>
        <View style={s.logoBox}><Image source={require('../assets/logo.png')} style={{width: 32, height: 32, resizeMode: 'contain'}} /></View>
        <View style={{marginLeft: 12, flex: 1}}>
          <Text style={s.appTitle}>Kiko AI</Text>
          <Text style={s.appSubtitle}>Call Order Taker</Text>
        </View>
        <TouchableOpacity style={s.appBarBtn} onPress={() => nav.navigate('Recordings')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="microphone" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={s.appBarBtn} 
          onPress={() => nav.navigate('Settings')} 
          onLongPress={async () => {
            showPopup('Exporting Logs...', 'Generating and saving all app activities to a text file...', 'info');
            try {
              await RecordingMonitorModule.exportAndShareLogs();
              hidePopup();
            } catch (e) {
              showPopup('Error', 'Failed to export logs', 'error');
            }
          }}
          delayLongPress={3000}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        >
          <Icon name="cog" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search + Sort */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <Icon name="magnify" size={22} color={Colors.textMuted} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search orders..."
            placeholderTextColor={Colors.textMuted}
            maxFontSizeMultiplier={1.2}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close" size={20} color={Colors.textMuted} style={s.clearIcon} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={[s.sortBtn, showSort && {backgroundColor: Colors.primary, borderColor: Colors.primary}]} onPress={() => setShowSort(!showSort)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="swap-vertical" size={24} color={showSort ? Colors.white : Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {showSort && (
        <View style={s.sortMenu}>
          {sortOptions.map(opt => (
            <TouchableOpacity key={opt.key} style={[s.sortItem, sortMode === opt.key && {backgroundColor: Colors.primary + '0D'}]} onPress={() => { setSortMode(opt.key); setShowSort(false); }}>
              <Icon name={opt.icon} size={20} color={sortMode === opt.key ? Colors.primary : Colors.textSecondary} style={{width: 32}} />
              <Text style={[s.sortItemText, sortMode === opt.key && {color: Colors.primary, fontWeight: FontWeights.semiBold}]}>{opt.label}</Text>
              {sortMode === opt.key && <Icon name="check" size={20} color={Colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Orders */}
      {filtered.length === 0 && !loading ? (
        <View style={s.emptyState}>
          <View style={s.emptyIconBox}><Icon name="format-list-bulleted" size={40} color={Colors.primary} style={{opacity: 0.5}} /></View>
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptyDesc}>Orders from processed call recordings{'\n'}will appear here automatically</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => nav.navigate('Recordings')}>
            <Text style={s.emptyBtnText}>Go to Recordings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.orderId}
          renderItem={renderOrder}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOrders} colors={[Colors.primary]}/>}
          contentContainerStyle={{padding: Spacing.sm, paddingBottom: 30}}
          showsVerticalScrollIndicator={false}
        />
      )}

      <CustomPopup {...popup} onClose={hidePopup}/>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},

  // AppBar
  appBar: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingVertical: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: {width: 0, height: 2}},
  logoBox: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: Colors.divider},
  logoText: {fontSize: 18, fontWeight: FontWeights.bold, color: Colors.white},
  appTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  appSubtitle: {fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1},
  appBarBtn: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginLeft: 8},
  appBarBtnIcon: {fontSize: 15, fontWeight: FontWeights.bold, color: Colors.primary},

  // Search
  searchRow: {flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm, alignItems: 'center'},
  searchWrap: {flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.divider, height: 48, paddingHorizontal: 14},
  searchIcon: {fontSize: 16, fontWeight: FontWeights.bold, color: Colors.textMuted, marginRight: 8},
  searchInput: {flex: 1, height: 48, fontSize: FontSizes.body, color: Colors.textPrimary, paddingVertical: 0},
  clearIcon: {fontSize: 22, color: Colors.textMuted, paddingHorizontal: 4},
  sortBtn: {width: 48, height: 48, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceLight, borderWidth: 1.5, borderColor: Colors.divider, justifyContent: 'center', alignItems: 'center', marginLeft: 8},
  sortBtnIcon: {fontSize: 18, fontWeight: FontWeights.bold, color: Colors.textSecondary},

  // Sort Menu
  sortMenu: {backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: {width: 0, height: 4}, marginBottom: 4, overflow: 'hidden'},
  sortItem: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: Spacing.lg, borderBottomWidth: 0.5, borderBottomColor: Colors.divider},
  sortItemIcon: {fontSize: 16, width: 28, color: Colors.textSecondary, fontWeight: FontWeights.medium},
  sortItemText: {flex: 1, fontSize: FontSizes.body, color: Colors.textPrimary},
  sortCheck: {fontSize: 16, color: Colors.primary, fontWeight: FontWeights.bold},

  // Order Card
  card: {backgroundColor: Colors.surface, marginHorizontal: Spacing.sm, marginVertical: 5, borderRadius: BorderRadius.xl, padding: Spacing.lg, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: {width: 0, height: 2}, borderWidth: 0.5, borderColor: Colors.divider + '80'},
  cardHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  cardHeaderLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  unreadDot: {width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.primary, marginRight: 7},
  orderId: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.primary},
  strike: {textDecorationLine: 'line-through', opacity: 0.5},
  cancelBadge: {backgroundColor: Colors.error + '14', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 8},
  cancelBadgeText: {fontSize: FontSizes.xs, fontWeight: FontWeights.semiBold, color: Colors.error},
  dateText: {fontSize: FontSizes.xs, color: Colors.textMuted},

  // Customer
  customerRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12},
  customerIcon: {width: 36, height: 36, borderRadius: BorderRadius.md, backgroundColor: Colors.primary + '14', justifyContent: 'center', alignItems: 'center'},
  customerIconText: {fontSize: 14, fontWeight: FontWeights.bold, color: Colors.primary},
  custName: {fontSize: FontSizes.lg, fontWeight: FontWeights.medium, color: Colors.textPrimary},
  custPhone: {fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 1},

  // Products
  productBox: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10},
  productText: {fontSize: FontSizes.sm, color: Colors.textSecondary, flex: 1},
  productCount: {fontSize: FontSizes.xs, color: Colors.textMuted, marginLeft: 8},

  // Footer
  cardFooter: {flexDirection: 'row', alignItems: 'center', marginTop: 12},
  totalBadge: {backgroundColor: Colors.primary + '10', borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 5},
  totalText: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.primary},
  sentBadge: {backgroundColor: Colors.whatsapp + '14', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8},
  sentBadgeText: {fontSize: FontSizes.xs, fontWeight: FontWeights.semiBold, color: Colors.whatsapp},
  waBtn: {backgroundColor: Colors.whatsapp, borderRadius: BorderRadius.md, paddingHorizontal: 16, paddingVertical: 9, minHeight: 38},
  waBtnText: {fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.white},

  // Empty State
  emptyState: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
  emptyIconBox: {width: 80, height: 80, borderRadius: 20, backgroundColor: Colors.primary + '10', justifyContent: 'center', alignItems: 'center'},
  emptyIcon: {fontSize: 32, fontWeight: FontWeights.bold, color: Colors.primary, opacity: 0.5},
  emptyTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginTop: Spacing.xxl},
  emptyDesc: {fontSize: FontSizes.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22},
  emptyBtn: {backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.xxxl, paddingVertical: 14, marginTop: Spacing.xxl},
  emptyBtnText: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.white},
});
