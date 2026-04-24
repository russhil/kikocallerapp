import React, {useRef, useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Animated,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';

const {width, height} = Dimensions.get('window');

// --- Custom Animated Slides ---

const Slide1Chaos = ({isFocused}) => {
  const ringAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused) {
      // Ring animation (rotate)
      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, {toValue: 1, duration: 100, useNativeDriver: true}),
          Animated.timing(ringAnim, {toValue: -1, duration: 100, useNativeDriver: true}),
          Animated.timing(ringAnim, {toValue: 1, duration: 100, useNativeDriver: true}),
          Animated.timing(ringAnim, {toValue: 0, duration: 100, useNativeDriver: true}),
          Animated.delay(1000), // wait before ringing again
        ])
      );
      // Shake animation (rotate slightly differently)
      const shake = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, {toValue: 1, duration: 50, useNativeDriver: true}),
          Animated.timing(shakeAnim, {toValue: -1, duration: 50, useNativeDriver: true}),
          Animated.timing(shakeAnim, {toValue: 0, duration: 50, useNativeDriver: true}),
          Animated.delay(1500),
        ])
      );

      ring.start();
      shake.start();

      return () => {
        ring.stop();
        shake.stop();
      };
    }
  }, [isFocused]);

  const ringRotate = ringAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-15deg', '15deg'],
  });
  
  const shakeRotate = shakeAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-5deg', '5deg'],
  });

  return (
    <View style={styles.slideContent}>
      <View style={styles.visualContainer}>
        {/* Center Shop */}
        <View style={styles.shopCenter}>
          <Icon name="storefront-outline" size={60} color="#111827" />
        </View>

        {/* Left Ringing Phone */}
        <Animated.View style={[styles.floatingIcon, {left: 20, top: 20, transform: [{rotate: ringRotate}]}]}>
          <View style={styles.dangerCircle}>
             <Icon name="phone-missed" size={28} color="#EF4444" />
          </View>
        </Animated.View>

        {/* Right Shaking Notes */}
        <Animated.View style={[styles.floatingIcon, {right: 20, bottom: 20, transform: [{rotate: shakeRotate}]}]}>
          <View style={styles.warningCircle}>
             <Icon name="notebook-remove-outline" size={32} color="#F59E0B" />
          </View>
        </Animated.View>

        {/* Top Thought Bubble */}
        <View style={[styles.floatingIcon, {right: 40, top: -20}]}>
          <Icon name="head-question-outline" size={36} color="#6B7280" />
        </View>
      </View>

      <Text style={styles.title}>Phone Call Orders Manage Karna Mushkil?</Text>
      
      <View style={styles.textPoints}>
        <Text style={styles.description}>• Missed calls = lost orders</Text>
        <Text style={styles.description}>• Writing = mistakes</Text>
        <Text style={styles.description}>• No history = confusion</Text>
      </View>
    </View>
  );
};

const Slide2Solution = ({isFocused}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused) {
      // Pulse animation for AI
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {toValue: 1.15, duration: 800, useNativeDriver: true}),
          Animated.timing(pulseAnim, {toValue: 1, duration: 800, useNativeDriver: true}),
        ])
      );
      // Flowing arrow animation (translateX)
      const flow = Animated.loop(
        Animated.sequence([
          Animated.timing(arrowAnim, {toValue: 1, duration: 1500, useNativeDriver: true}),
          Animated.timing(arrowAnim, {toValue: 0, duration: 0, useNativeDriver: true}), // snap back
        ])
      );

      pulse.start();
      flow.start();

      return () => {
        pulse.stop();
        flow.stop();
      };
    }
  }, [isFocused]);

  const arrowTranslate = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 20],
  });
  
  const arrowOpacity = arrowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  return (
    <View style={styles.slideContent}>
      <View style={[styles.visualContainer, {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20}]}>
        
        {/* Step 1: Call */}
        <View style={styles.stepBox}>
          <Icon name="phone-in-talk-outline" size={32} color="#111827" />
        </View>

        {/* Arrow Flow */}
        <Animated.View style={{transform: [{translateX: arrowTranslate}], opacity: arrowOpacity}}>
          <Icon name="arrow-right-thick" size={24} color="#3B82F6" />
        </Animated.View>

        {/* Step 2: AI */}
        <Animated.View style={{transform: [{scale: pulseAnim}]}}>
          <LinearGradient
            colors={['#8B5CF6', '#3B82F6']}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={styles.aiCircle}
          >
            <Icon name="robot-outline" size={40} color="#FFFFFF" />
          </LinearGradient>
        </Animated.View>

        {/* Arrow Flow */}
        <Animated.View style={{transform: [{translateX: arrowTranslate}], opacity: arrowOpacity}}>
          <Icon name="arrow-right-thick" size={24} color="#3B82F6" />
        </Animated.View>

        {/* Step 3: Order */}
        <View style={styles.stepBox}>
          <Icon name="clipboard-check-outline" size={32} color="#10B981" />
        </View>

      </View>

      <Text style={styles.title}>Call Aaya → Order Ready!</Text>
      
      <View style={styles.textPoints}>
        <Text style={styles.description}>• Call normal hi lo</Text>
        <Text style={styles.description}>• AI automatically samjhega</Text>
        <Text style={styles.description}>• Order ready ho jayega</Text>
      </View>
    </View>
  );
};

const Slide3Benefits = ({isFocused}) => {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused) {
      // Bobbing animation for icons
      const float = Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {toValue: 1, duration: 2000, useNativeDriver: true}),
          Animated.timing(floatAnim, {toValue: 0, duration: 2000, useNativeDriver: true}),
        ])
      );
      
      // Badge pop-in animation
      const badge = Animated.spring(badgeScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        delay: 500,
        useNativeDriver: true,
      });

      float.start();
      badge.start();

      return () => {
        float.stop();
        badgeScale.setValue(0);
      };
    }
  }, [isFocused]);

  const floatY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  return (
    <View style={styles.slideContent}>
      <View style={styles.visualContainer}>
        
        {/* Center Dashboard */}
        <View style={styles.dashboardMock}>
          <View style={styles.dashHeader} />
          <View style={styles.dashItem} />
          <View style={styles.dashItem} />
          <View style={styles.dashItem} />
        </View>

        {/* Floating Icons */}
        <Animated.View style={[styles.floatingIcon, {left: -10, top: 0, transform: [{translateY: floatY}]}]}>
           <View style={[styles.stepBox, {backgroundColor: '#F3E8FF'}]}>
             <Icon name="cellphone" size={24} color="#8B5CF6" />
           </View>
        </Animated.View>

        <Animated.View style={[styles.floatingIcon, {right: -10, top: 20, transform: [{translateY: floatY}]}]}>
           <View style={[styles.stepBox, {backgroundColor: '#DBEAFE'}]}>
             <Icon name="history" size={24} color="#3B82F6" />
           </View>
        </Animated.View>

        <Animated.View style={[styles.floatingIcon, {left: 10, bottom: -10, transform: [{translateY: floatY}]}]}>
           <View style={[styles.stepBox, {backgroundColor: '#D1FAE5'}]}>
             <Icon name="whatsapp" size={24} color="#10B981" />
           </View>
        </Animated.View>

        <Animated.View style={[styles.floatingIcon, {right: 10, bottom: -20, transform: [{translateY: floatY}]}]}>
           <View style={[styles.stepBox, {backgroundColor: '#FEE2E2'}]}>
             <Icon name="rocket-launch-outline" size={24} color="#EF4444" />
           </View>
        </Animated.View>

        {/* Trust Badge Pop-up */}
        <Animated.View style={[styles.trustBadge, {transform: [{scale: badgeScale}]}]}>
          <Icon name="check-decagram" size={18} color="#10B981" style={{marginRight: 4}} />
          <Text style={styles.trustText}>1000+ Shop Owners</Text>
        </Animated.View>

      </View>

      <Text style={styles.title}>Simple. Powerful. Reliable.</Text>
      
      <View style={styles.textPoints}>
        <Text style={styles.description}>• No new system</Text>
        <Text style={styles.description}>• No training</Text>
        <Text style={styles.description}>• Sab automatic</Text>
      </View>
    </View>
  );
};


// --- Main Component ---

const SLIDES = [
  { id: '1', Component: Slide1Chaos },
  { id: '2', Component: Slide2Solution },
  { id: '3', Component: Slide3Benefits },
];

export default function OnboardingScreen() {
  const nav = useNavigation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const slidesRef = useRef(null);

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasLaunched', 'true');
      nav.replace('Login');
    } catch (e) {
      console.error('Error saving onboarding state:', e);
      nav.replace('Login');
    }
  };

  const scrollToNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      slidesRef.current.scrollToIndex({index: currentIndex + 1});
    } else {
      completeOnboarding();
    }
  };

  const onViewableItemsChanged = useRef(({viewableItems}) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewConfig = useRef({viewAreaCoveragePercentThreshold: 50}).current;

  const renderItem = ({item, index}) => {
    const isFocused = index === currentIndex;
    const { Component } = item;
    return (
      <View style={[styles.slideWrapper, {width}]}>
        <Component isFocused={isFocused} />
      </View>
    );
  };

  const renderDots = () => {
    return (
      <View style={styles.dotsContainer}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [10, 24, 10],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          const backgroundColor = scrollX.interpolate({
            inputRange,
            outputRange: ['#9CA3AF', '#3B82F6', '#9CA3AF'],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={i.toString()}
              style={[styles.dot, {width: dotWidth, opacity, backgroundColor}]}
            />
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={completeOnboarding} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={{flex: 1}}>
        <Animated.FlatList
          ref={slidesRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          bounces={false}
          onScroll={Animated.event([{nativeEvent: {contentOffset: {x: scrollX}}}], {
            useNativeDriver: false,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfig}
          scrollEventThrottle={32}
        />
      </View>

      <View style={styles.bottomContainer}>
        {renderDots()}

        <TouchableOpacity style={styles.buttonContainer} onPress={scrollToNext} activeOpacity={0.8}>
          <LinearGradient
            colors={['#8B5CF6', '#3B82F6']}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {currentIndex === SLIDES.length - 1 ? 'Start Taking Orders' : 'Next'}
            </Text>
            {currentIndex !== SLIDES.length - 1 && (
              <Icon name="arrow-right" size={20} color="#FFFFFF" style={{marginLeft: 8}} />
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: 'flex-end',
    height: 60,
  },
  skipText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  slideWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideContent: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Visual containers
  visualContainer: {
    width: 250,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    position: 'relative',
  },
  floatingIcon: {
    position: 'absolute',
    zIndex: 10,
  },
  shopCenter: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  dangerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  warningCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  aiCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  stepBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dashboardMock: {
    width: 160,
    height: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  dashHeader: {
    height: 16,
    width: '60%',
    backgroundColor: '#D1D5DB',
    borderRadius: 8,
    marginBottom: 20,
  },
  dashItem: {
    height: 24,
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 10,
  },
  trustBadge: {
    position: 'absolute',
    bottom: -15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B981',
    zIndex: 20,
  },
  trustText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
  },

  // Typography
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 34,
  },
  textPoints: {
    alignItems: 'flex-start',
    width: '80%',
  },
  description: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 28,
    fontWeight: '600',
    marginBottom: 4,
  },

  // Bottom Controls
  bottomContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  buttonContainer: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
