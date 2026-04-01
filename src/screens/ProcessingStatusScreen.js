import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, TouchableOpacity, FlatList, RefreshControl, StyleSheet, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function ProcessingStatusScreen() {
  const nav = useNavigation();
  const [recordings, setRecordings] = useState([]);
  const [orders, setOrders] = useState([]);

  const loadData = async () => {
    try {
      const recRaw = await AsyncStorage.getItem('recordingsState');
      const recState = recRaw ? JSON.parse(recRaw) : {};
      const recList = Object.entries(recState).map(([path, data]) => ({path, ...data}));
      setRecordings(recList);

      const ordRaw = await AsyncStorage.getItem('orders');
      const ordList = ordRaw ? JSON.parse(ordRaw) : [];
      setOrders(ordList);
    } catch (e) {}
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const processedCount = recordings.filter(r => r.isProcessed).length;
  const orderCount = orders.length;
  const personalCount = recordings.filter(r => r.classification === 'PERSONAL_CALL').length;

  const recentOrders = orders.slice(0, 10);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.appBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.appBarTitle}>Processing Status</Text>
      </View>

      <FlatList
        data={recentOrders}
        keyExtractor={item => item.orderId}
        ListHeaderComponent={() => (
          <>
            {/* Summary stats */}
            <View style={s.statsCard}>
              <View style={s.statRow}>
                <View style={s.statBox}>
                  <Text style={[s.statNum, {color: Colors.primary}]}>{processedCount}</Text>
                  <Text style={s.statLabel}>Processed</Text>
                </View>
                <View style={s.statDivider}/>
                <View style={s.statBox}>
                  <Text style={[s.statNum, {color: Colors.success}]}>{orderCount}</Text>
                  <Text style={s.statLabel}>Orders</Text>
                </View>
                <View style={s.statDivider}/>
                <View style={s.statBox}>
                  <Text style={[s.statNum, {color: Colors.textMuted}]}>{personalCount}</Text>
                  <Text style={s.statLabel}>Personal</Text>
                </View>
              </View>
            </View>

            {recentOrders.length > 0 && <Text style={s.listTitle}>Recent Orders</Text>}
          </>
        )}
        renderItem={({item: order}) => (
          <TouchableOpacity style={s.orderCard} onPress={() => nav.navigate('OrderDetail', {orderId: order.orderId})} activeOpacity={0.7}>
            <View style={s.orderRow}>
              <View style={s.orderIcon}><Icon name="check" size={20} color={Colors.success} /></View>
              <View style={{flex: 1, marginLeft: 12}}>
                <Text style={s.orderIdText}>#{order.orderId}</Text>
                <Text style={s.orderMeta}>{order.customerName || 'Unknown'} · {order.products?.length || 0} item{(order.products?.length || 0) > 1 ? 's' : ''}</Text>
              </View>
              {order.totalAmount ? <Text style={s.orderAmount}>₹{Math.round(order.totalAmount)}</Text> : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}><Icon name="format-list-checks" size={32} color={Colors.success} /></View>
            <Text style={s.emptyTitle}>No orders yet</Text>
            <Text style={s.emptyDesc}>Process your call recordings to see orders here</Text>
          </View>
        )}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadData} colors={[Colors.primary]}/>}
        contentContainerStyle={{padding: Spacing.lg, paddingBottom: 30}}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  appBar: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingVertical: 14, elevation: 2},
  backBtn: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 8},
  backIcon: {fontSize: 20, color: Colors.textPrimary, fontWeight: FontWeights.bold},
  appBarTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},

  statsCard: {backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.xl, borderWidth: 0.5, borderColor: Colors.divider, marginBottom: Spacing.lg},
  statRow: {flexDirection: 'row', alignItems: 'center'},
  statBox: {flex: 1, alignItems: 'center'},
  statNum: {fontSize: FontSizes.xxl, fontWeight: FontWeights.bold},
  statLabel: {fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 4},
  statDivider: {width: 1, height: 36, backgroundColor: Colors.divider},

  listTitle: {fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginBottom: Spacing.md},
  orderCard: {backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 0.5, borderColor: Colors.divider, marginBottom: Spacing.sm},
  orderRow: {flexDirection: 'row', alignItems: 'center'},
  orderIcon: {width: 36, height: 36, borderRadius: BorderRadius.md, backgroundColor: Colors.success + '14', justifyContent: 'center', alignItems: 'center'},
  orderIconText: {fontSize: 16, fontWeight: FontWeights.bold, color: Colors.success},
  orderIdText: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.primary},
  orderMeta: {fontSize: FontSizes.sm, color: Colors.textMuted, marginTop: 2},
  orderAmount: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.textPrimary},

  emptyState: {alignItems: 'center', paddingVertical: 60},
  emptyIcon: {width: 64, height: 64, borderRadius: 16, backgroundColor: Colors.success + '14', justifyContent: 'center', alignItems: 'center'},
  emptyIconText: {fontSize: 28, fontWeight: FontWeights.bold, color: Colors.success},
  emptyTitle: {fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginTop: Spacing.xl},
  emptyDesc: {fontSize: FontSizes.body, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center'},
});
