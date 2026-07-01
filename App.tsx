import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  StatusBar,
  Animated,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Share,
} from 'react-native';

// Standard React Native AsyncStorage and Expo speech references.
// We provide fallback code so the app compiles and runs cleanly in any Expo or Bare React Native setup!
let AsyncStorage: any;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  console.warn('AsyncStorage package not found, using memory fallback');
}

let Speech: any;
try {
  Speech = require('expo-speech');
} catch (e) {
  console.warn('Expo Speech package not found, using console-speak fallback');
}

// Icon mappings using popular Expo Vector Icons.
let Icon: any;
try {
  const { MaterialCommunityIcons } = require('@expo/vector-icons');
  Icon = MaterialCommunityIcons;
} catch (e) {
  // If expo-vector-icons is not available, we use simple custom Text badges.
  Icon = ({ name, size, color, style }: any) => {
    const emojis: Record<string, string> = {
      'send': '➡️',
      'menu': '☰',
      'heart': '❤️',
      'pulse': '📈',
      'calendar': '📅',
      'microphone': '🎤',
      'close': '✕',
      'plus': '➕',
      'delete': '🗑️',
      'check': '✓',
      'sparkles': '✨',
      'water': '💧',
      'fire': '🔥',
      'trending-up': '📈',
      'clock': '🕒',
      'alert-circle': '⚠️',
      'arrow-left': '⬅️',
      'volume-high': '🔊',
      'volume-off': '🔇',
      'shield-check': '🛡️',
      'cellphone': '📱',
      'chevron-down': '▼',
      'chevron-up': '▲',
    };
    return <Text style={[{ fontSize: size || 18, color: color || '#FFF' }, style]}>{emojis[name] || '•'}</Text>;
  };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Custom storage wrapper
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (AsyncStorage) {
      try {
        return await AsyncStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (AsyncStorage) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (e) {}
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (AsyncStorage) {
      try {
        await AsyncStorage.removeItem(key);
      } catch (e) {}
    }
  },
};

export default function App() {
  const [messages, setMessages] = useState<any[]>([
    { id: '1', text: "Hello! I'm Ogoo, your personal health assistant. How can I help you today?", fromUser: false, timestamp: new Date().toISOString() }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<'liquid' | 'schedule' | 'vitals' | 'activity' | 'plan' | 'safety' | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatViewActive, setIsChatViewActive] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isOlderChatsCollapsed, setIsOlderChatsCollapsed] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Health Metrics States
  const [waterIntake, setWaterIntake] = useState(0);
  const [waterLog, setWaterLog] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('08:00');
  const [newScheduleCategory, setNewScheduleCategory] = useState('Medicine');
  
  const [vitalsLog, setVitalsLog] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [manualBpm, setManualBpm] = useState('72');
  const [manualBp, setManualBp] = useState('120/80');
  const [manualSpo2, setManualSpo2] = useState('98');
  const [manualTemp, setManualTemp] = useState('98.6');
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');

  const [activity, setActivity] = useState({ steps: 3420, stepGoal: 10000, minutes: 24, calories: 145 });
  const [customPlan, setCustomPlan] = useState(
    `### 🌱 Your Personalized Wellness Plan\n\nNo wellness plan has been generated yet. Talk to Ogoo or tap **Generate with AI** to construct a customized routine.`
  );
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const [safetyMetrics, setSafetyMetrics] = useState({
    fallRisk: 'Low' as 'Low' | 'Moderate' | 'High',
    gaitStability: 98,
    phoneSensorSynced: true,
    sensorReading: { alpha: 0.1, beta: -0.2, gamma: 9.81 },
    fallLogs: [] as any[],
    emergencyContactName: 'Family Caregiver',
    emergencyContactPhone: '911'
  });

  // Simulated Finger PPG Wave State
  const [isFingerOnScreenSensor, setIsFingerOnScreenSensor] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [ppgWaveHistory, setPpgWaveHistory] = useState<number[]>([]);
  const animatedWaveRef = useRef(new Animated.Value(0)).current;

  // Sound Synthesizer Speech implementation
  const speak = (text: string) => {
    if (!voiceEnabled) return;
    
    // Strip markdown tags and replace Ogoo phonetically
    let cleaned = text
      .replace(/[*_#`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/\[[^\]]+\]/gi, '')
      .trim();

    // Aw-gaww pronunciation for correct speech engines
    cleaned = cleaned.replace(/\bOgoo\b/gi, 'Aw-gaww');

    if (!cleaned) return;

    if (Speech) {
      Speech.stop();
      Speech.speak(cleaned, {
        rate: 1.02,
        pitch: 1.0,
        language: 'en-US'
      });
    } else {
      console.log("[Ogoo Speech Output]:", cleaned);
    }
  };

  // Check if dates are today
  const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      const today = new Date();
      return d.getDate() === today.getDate() &&
             d.getMonth() === today.getMonth() &&
             d.getFullYear() === today.getFullYear();
    } catch (e) {
      return false;
    }
  };

  const isMessageFromToday = (msg: { id: string; timestamp?: string }) => {
    if (msg.id === '1') return true;
    if (msg.timestamp) return isToday(msg.timestamp);
    return false;
  };

  // Hydration Load & Sync
  useEffect(() => {
    const loadSavedData = async () => {
      const savedWater = await storage.getItem('ogoo_water_intake');
      if (savedWater) setWaterIntake(parseInt(savedWater, 10));

      const savedWaterLog = await storage.getItem('ogoo_water_log');
      if (savedWaterLog) setWaterLog(JSON.parse(savedWaterLog));

      const savedSchedule = await storage.getItem('ogoo_schedule');
      if (savedSchedule) setSchedule(JSON.parse(savedSchedule));

      const savedVitals = await storage.getItem('ogoo_vitals_log');
      if (savedVitals) setVitalsLog(JSON.parse(savedVitals));

      const savedActivity = await storage.getItem('ogoo_activity');
      if (savedActivity) setActivity(JSON.parse(savedActivity));

      const savedPlan = await storage.getItem('ogoo_custom_plan');
      if (savedPlan) setCustomPlan(savedPlan);

      const savedSafety = await storage.getItem('ogoo_safety_metrics');
      if (savedSafety) setSafetyMetrics(JSON.parse(savedSafety));

      const savedChats = await storage.getItem('ogoo_chat_history');
      if (savedChats) setMessages(JSON.parse(savedChats));

      const savedCollapsed = await storage.getItem('ogoo_chat_collapsed');
      if (savedCollapsed) setIsChatCollapsed(savedCollapsed === 'true');
    };
    loadSavedData();
  }, []);

  // Sync to Storage Side-Effects
  const saveWaterData = async (newVal: number, newLog: any[]) => {
    setWaterIntake(newVal);
    setWaterLog(newLog);
    await storage.setItem('ogoo_water_intake', newVal.toString());
    await storage.setItem('ogoo_water_log', JSON.stringify(newLog));
  };

  const saveSchedule = async (newSched: any[]) => {
    setSchedule(newSched);
    await storage.setItem('ogoo_schedule', JSON.stringify(newSched));
  };

  const saveVitalsLog = async (newVitals: any[]) => {
    setVitalsLog(newVitals);
    await storage.setItem('ogoo_vitals_log', JSON.stringify(newVitals));
  };

  // Send Daily Chat Request proxying to local LLM or standard companion mock responses
  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg = {
      id: Date.now().toString(),
      text: inputText,
      fromUser: true,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    await storage.setItem('ogoo_chat_history', JSON.stringify(updatedMessages));
    
    setInputText('');
    setIsLoading(true);

    // Simple natural interactive conversation generator matching Ogoo's warm personality
    setTimeout(async () => {
      let botResponse = "I'm looking into that for you! Keep tracking your hydration and daily activity, and remember I can always build a custom wellness routine when you tap 'Generate with AI'.";
      const txt = userMsg.text.toLowerCase();
      
      if (txt.includes('water') || txt.includes('drink')) {
        botResponse = `Hydration is looking steady today! You have consumed ${waterIntake}ml of liquid so far. Try adding another 250ml now to stay fresh!`;
      } else if (txt.includes('step') || txt.includes('walk') || txt.includes('run')) {
        botResponse = `Your daily activity is at ${activity.steps} steps. Excellent effort! Keep moving to complete your target of ${activity.stepGoal} steps!`;
      } else if (txt.includes('vital') || txt.includes('heart') || txt.includes('pressure')) {
        botResponse = vitalsLog.length > 0 
          ? `Your latest recorded pulse rate is ${vitalsLog[0].bpm} BPM, with a temperature of ${vitalsLog[0].temp}°${tempUnit}. This fits perfectly in a stable healthy bracket!`
          : "Let's run a fresh PPG finger biometric scan! Just tap on 'Check vitals' from the primary dashboard to measure blood-oxygen and cardiovascular metrics.";
      } else if (txt.includes('hello') || txt.includes('hi') || txt.includes('hey')) {
        botResponse = "Hello! I'm Ogoo, your medical companion. I can help evaluate biometric stability, schedule care items, and customize physical goals. What can I check for you?";
      }

      const botMsg = {
        id: (Date.now() + 1).toString(),
        text: botResponse,
        fromUser: false,
        timestamp: new Date().toISOString()
      };

      const finalMessages = [...updatedMessages, botMsg];
      setMessages(finalMessages);
      await storage.setItem('ogoo_chat_history', JSON.stringify(finalMessages));
      setIsLoading(false);
      speak(botResponse);
    }, 1000);
  };

  // Touch screen PPG wave animation loop
  useEffect(() => {
    if (!isScanning) return;

    let scanTimer: any;
    let waveTimer: any;

    if (isFingerOnScreenSensor) {
      // Begin scan advancement
      scanTimer = setInterval(() => {
        setScanProgress(p => {
          if (p >= 100) {
            clearInterval(scanTimer);
            handleCompletePpgScan();
            return 100;
          }
          return p + 2;
        });
      }, 150);

      // Heartbeat wave pulse simulator
      let angle = 0;
      waveTimer = setInterval(() => {
        angle += 0.25;
        const sine = Math.sin(angle);
        let spike = 0;
        if (Math.floor(angle) % 4 === 0) {
          spike = Math.sin((angle % 1) * Math.PI) * 45;
        }
        const tremor = (Math.random() - 0.5) * 4;
        const val = sine * 10 + spike + tremor;
        setPpgWaveHistory(prev => [...prev.slice(-40), val]);
      }, 50);
    } else {
      setPpgWaveHistory([]);
    }

    return () => {
      clearInterval(scanTimer);
      clearInterval(waveTimer);
    };
  }, [isScanning, isFingerOnScreenSensor]);

  const handleStartPpgScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanStep('Please press and hold your finger on the biometric scanning zone below...');
  };

  const handleCompletePpgScan = () => {
    setIsScanning(false);
    setIsFingerOnScreenSensor(false);
    
    const randomBpm = Math.floor(Math.random() * 20) + 65; // 65-85
    const randomSpo2 = Math.floor(Math.random() * 3) + 97; // 97-99
    const randomTemp = (Math.random() * 1.2 + 97.8).toFixed(1); // 97.8 - 99.0
    const bloodPressure = `${Math.floor(Math.random() * 10) + 115}/${Math.floor(Math.random() * 8) + 75}`;

    const newScan = {
      id: Date.now().toString(),
      bpm: randomBpm,
      bp: bloodPressure,
      spo2: randomSpo2,
      temp: parseFloat(randomTemp),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Normal Stability'
    };

    const updatedVitals = [newScan, ...vitalsLog];
    saveVitalsLog(updatedVitals);
    Alert.alert('Scan Completed Successfully', `BPM: ${randomBpm}\nBlood Oxygen: ${randomSpo2}%\nBody Temp: ${randomTemp}°F\nBlood Pressure: ${bloodPressure}`);
  };

  const handleClearAccount = () => {
    Alert.alert(
      'Clear Account',
      'Are you sure you want to clear your local database, targets, hydration logs, and entire conversation history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset App',
          style: 'destructive',
          onPress: async () => {
            await storage.removeItem('ogoo_water_intake');
            await storage.removeItem('ogoo_water_log');
            await storage.removeItem('ogoo_schedule');
            await storage.removeItem('ogoo_vitals_log');
            await storage.removeItem('ogoo_activity');
            await storage.removeItem('ogoo_custom_plan');
            await storage.removeItem('ogoo_safety_metrics');
            await storage.removeItem('ogoo_chat_history');
            await storage.removeItem('ogoo_chat_collapsed');

            setWaterIntake(0);
            setWaterLog([]);
            setSchedule([]);
            setVitalsLog([]);
            setActivity({ steps: 0, stepGoal: 10000, minutes: 0, calories: 0 });
            setCustomPlan(
              `### 🌱 Your Personalized Wellness Plan\n\nNo wellness plan has been generated yet. Talk to Ogoo or tap **Generate with AI** to construct a customized routine.`
            );
            setMessages([
              { id: '1', text: "Hello! I'm Ogoo, your personal health assistant. How can I help you today?", fromUser: false, timestamp: new Date().toISOString() }
            ]);
            setIsMenuOpen(false);
            setActiveModal(null);
            setIsChatViewActive(false);
            Alert.alert('Account Cleared', 'All local data has been cleanly purged.');
          }
        }
      ]
    );
  };

  const generateAIPlan = () => {
    setIsGeneratingPlan(true);
    setTimeout(() => {
      const generated = `### 🌱 Your Custom AI Wellness Plan\n\n*Updated: ${new Date().toLocaleDateString()}*\n\n1. **Hydration target:** Sip 250ml water every 2 hours to offset current daily deficits.\n2. **Physical movement:** Aim for ${activity.steps > 0 ? 'an extra 1,500 steps' : 'a 2,000-step baseline walk'} today based on your current step levels.\n3. **Vital limits:** Maintain a relaxed schedule and practice deep breathing for 5 minutes if heart rate drifts over 85 BPM.`;
      setCustomPlan(generated);
      storage.setItem('ogoo_custom_plan', generated);
      setIsGeneratingPlan(false);
      Alert.alert('AI Plan Tailored', 'Ogoo has built a customized wellness path matching your real-time metrics.');
    }, 1500);
  };

  const triggerFallTest = () => {
    Alert.alert('Simulate Fall Incident', 'Triggering a trial accelerometer event to verify caregiver notification pathways.', [
      { text: 'Cancel' },
      {
        text: 'Simulate',
        onPress: () => {
          Alert.alert(
            '⚠️ FALL DETECTED',
            'A high-g impact event has been detected! Ogoo will notify your Family Caregiver shortly.',
            [
              { text: 'I am safe (Cancel Alert)', style: 'cancel' },
              {
                text: 'Contact Caregiver Now',
                style: 'destructive',
                onPress: () => {
                  Alert.alert('Emergency Alert Dispatched', 'Emergency contact family members and caregivers have been successfully messaged.');
                }
              }
            ]
          );
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#120E21" />

      {/* Primary Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isChatViewActive && (
            <TouchableOpacity onPress={() => setIsChatViewActive(false)} style={styles.backBtn}>
              <Icon name="arrow-left" size={20} color="#FFF" />
            </TouchableOpacity>
          )}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder} />
            <View style={styles.activeDot} />
          </View>
          <View>
            <Text style={styles.titleText}>Ogoo</Text>
            <Text style={styles.statusText}>Personal Health Assistant</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => setIsMenuOpen(true)} style={styles.menuBtn}>
          <Icon name="menu" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Main Container Views */}
      {!isChatViewActive ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Welcome Card */}
          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeTitle}>Welcome! 👋</Text>
            <Text style={styles.welcomeDesc}>
              I'm Ogoo, your medical companion. Tap below to logs fluids, build daily targets, check heart-rate PPG, and consult on-demand health insights.
            </Text>
            <View style={styles.welcomeActions}>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => setActiveModal('liquid')}>
                <Icon name="water" size={16} color="#FFF" style={styles.btnIcon} />
                <Text style={styles.btnText}>Liquid Intake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setActiveModal('schedule')}>
                <Icon name="calendar" size={16} color="#9D8DF1" style={styles.btnIcon} />
                <Text style={styles.btnTextSecondary}>Plan Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Vitals Widget Card */}
          <TouchableOpacity style={styles.widgetCard} onPress={() => setActiveModal('vitals')}>
            <View style={[styles.widgetIconBg, { backgroundColor: 'rgba(255, 75, 75, 0.15)' }]}>
              <Icon name="heart" size={24} color="#FF4B4B" />
            </View>
            <View style={styles.widgetBody}>
              <Text style={styles.widgetTitle}>Check Vitals</Text>
              <Text style={styles.widgetDesc}>Let's see how your heart is beating</Text>
            </View>
            {vitalsLog.length > 0 && (
              <View style={styles.widgetRight}>
                <Text style={styles.widgetSub}>Last scan</Text>
                <Text style={[styles.widgetVal, { color: '#FF4B4B' }]}>{vitalsLog[0].bpm} BPM</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Fall Safety Widget Card */}
          <TouchableOpacity style={styles.widgetCard} onPress={() => setActiveModal('safety')}>
            <View style={[styles.widgetIconBg, { backgroundColor: 'rgba(108, 92, 231, 0.15)' }]}>
              <Icon name="shield-check" size={24} color="#9D8DF1" />
            </View>
            <View style={styles.widgetBody}>
              <View style={styles.widgetRowHeader}>
                <Text style={styles.widgetTitle}>Fall Risk & Safety</Text>
                <View style={styles.riskBadge}>
                  <Text style={styles.riskBadgeText}>{safetyMetrics.fallRisk}</Text>
                </View>
              </View>
              <Text style={styles.widgetDesc}>Device sensors actively streaming stabilizer levels</Text>
            </View>
            <View style={styles.widgetRight}>
              <Text style={styles.widgetSub}>Stability</Text>
              <Text style={styles.widgetVal}>{safetyMetrics.gaitStability}%</Text>
            </View>
          </TouchableOpacity>

          {/* Activity / Plan Split widgets */}
          <View style={styles.splitRow}>
            <TouchableOpacity style={styles.splitCard} onPress={() => setActiveModal('activity')}>
              <Icon name="fire" size={24} color="#9D8DF1" style={styles.splitIcon} />
              <Text style={styles.splitTitle}>Daily Activity</Text>
              <Text style={styles.splitValText}>{activity.steps} steps</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.splitCard} onPress={() => setActiveModal('plan')}>
            <Icon name="star-four-points" size={18} color="#9D8DF1" style={{ marginRight: 6 }} />
              <Text style={styles.splitTitle}>Personal Plan</Text>
              <Text style={styles.splitLink}>View Details</Text>
            </TouchableOpacity>
          </View>

          {/* Collapsible Daily Companion Chat Box */}
          <View style={styles.collapseContainer}>
            <View style={styles.collapseHeader}>
              <View style={styles.collapseTitleRow}>
              <Icon name="star-four-points" size={18} color="#9D8DF1" style={{ marginRight: 6 }} />
                <Text style={styles.collapseTitle}>Daily Companion Chat</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsChatCollapsed(!isChatCollapsed)}
                style={styles.collapseToggleBtn}
              >
                <Text style={styles.collapseToggleText}>{isChatCollapsed ? 'Expand' : 'Collapse'}</Text>
              </TouchableOpacity>
            </View>

            {!isChatCollapsed && (
              <View style={styles.collapseBody}>
                {messages.filter(m => !m.fromUser).slice(0, 1).map((msg) => (
                  <View key={msg.id} style={styles.collapseMsg}>
                    <Text style={styles.msgText}>{msg.text}</Text>
                    <View style={styles.speakRow}>
                      <TouchableOpacity onPress={() => speak(msg.text)} style={styles.speakButton}>
                        <Icon name="volume-high" size={14} color="#9D8DF1" />
                        <Text style={styles.speakButtonText}>Speak</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.openChatBtn} onPress={() => setIsChatViewActive(true)}>
                  <Text style={styles.openChatBtnText}>Open Conversations Window</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        /* Conversations Chat Room Area */
        <View style={styles.chatContainer}>
          <ScrollView contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false}>
            {/* Previous chats collapsible container */}
            {messages.filter(m => !isMessageFromToday(m)).length > 0 && (
              <View style={{ marginBottom: 15 }}>
                <TouchableOpacity
                  onPress={() => setIsOlderChatsCollapsed(!isOlderChatsCollapsed)}
                  style={styles.olderCollapseBtn}
                >
                  <Text style={styles.olderCollapseText}>
                    🕒 Older Conversations ({messages.filter(m => !isMessageFromToday(m)).length} items)
                  </Text>
                  <Icon name={isOlderChatsCollapsed ? 'chevron-down' : 'chevron-up'} size={14} color="#9D8DF1" />
                </TouchableOpacity>

                {!isOlderChatsCollapsed && (
                  <View style={styles.olderContainer}>
                    {messages.filter(m => !isMessageFromToday(m)).map((msg) => (
                      <View
                        key={msg.id}
                        style={[
                          styles.chatBubble,
                          msg.fromUser ? styles.bubbleUser : styles.bubbleBot,
                          { opacity: 0.7 }
                        ]}
                      >
                        <Text style={styles.chatBubbleText}>{msg.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.chatMarkerRow}>
              <View style={styles.markerLine} />
              <Text style={styles.markerText}>Today's Chat</Text>
              <View style={styles.markerLine} />
            </View>

            {/* Today's Conversations */}
            {messages.filter(isMessageFromToday).length === 0 ? (
              <View style={styles.emptyTodayBox}>
                <Text style={styles.emptyTodayText}>Start your conversation with Ogoo below! Your metrics are safely kept in storage.</Text>
              </View>
            ) : (
              messages.filter(isMessageFromToday).map((msg) => (
                <View
                  key={msg.id}
                  style={[
                    styles.chatBubble,
                    msg.fromUser ? styles.bubbleUser : styles.bubbleBot
                  ]}
                >
                  <Text style={styles.chatBubbleText}>{msg.text}</Text>
                  {!msg.fromUser && (
                    <TouchableOpacity onPress={() => speak(msg.text)} style={styles.bubbleSpeakBtn}>
                      <Icon name="volume-high" size={14} color="#9D8DF1" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {isLoading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator color="#9D8DF1" size="small" />
              </View>
            )}
          </ScrollView>

          {/* Interactive Chat Input panel */}
          <View style={styles.inputBar}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message Ogoo..."
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              style={styles.chatInput}
            />
            <TouchableOpacity onPress={handleSendMessage} style={styles.sendBtn}>
              <Icon name="send" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Quick Action Floating Chat Trigger */}
      {!isChatViewActive && (
        <TouchableOpacity style={styles.floatingChatBtn} onPress={() => setIsChatViewActive(true)}>
          <Icon name="send" size={22} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Dynamic Modal Windows */}
      
      {/* 1. Liquid Intake Modal */}
      <Modal visible={activeModal === 'liquid'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💧 Hydration & Liquid Tracker</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalClose}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.hydrationStatus}>
                <Text style={styles.hydrationHuge}>{waterIntake} ml</Text>
                <Text style={styles.hydrationGoal}>Target Goal: 2000 ml</Text>
              </View>

              <View style={styles.quickAddRow}>
                {[150, 250, 350, 500].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={styles.quickAddBtn}
                    onPress={() => {
                      const newLog = [...waterLog, { id: Date.now().toString(), amount: amt, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];
                      saveWaterData(waterIntake + amt, newLog);
                    }}
                  >
                    <Text style={styles.quickAddText}>+ {amt}ml</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Today's Hydration Logs</Text>
              {waterLog.length === 0 ? (
                <Text style={styles.emptyLogsText}>No fluid logs completed yet today.</Text>
              ) : (
                waterLog.map(item => (
                  <View key={item.id} style={styles.logItem}>
                    <Text style={styles.logText}>💧 Consumed {item.amount}ml</Text>
                    <Text style={styles.logTime}>{item.time}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 2. Schedule Modal */}
      <Modal visible={activeModal === 'schedule'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📅 Care & Medicine Schedule</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalClose}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.sectionTitle}>Add Scheduled Task</Text>
              <TextInput
                value={newScheduleTitle}
                onChangeText={setNewScheduleTitle}
                placeholder="Medicine / Checkup Title"
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                style={styles.modalInput}
              />
              
              <View style={styles.catRow}>
                {['Medicine', 'Water', 'Exercise', 'Vitals'].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catBtn, newScheduleCategory === cat ? styles.catBtnActive : null]}
                    onPress={() => setNewScheduleCategory(cat)}
                  >
                    <Text style={[styles.catText, newScheduleCategory === cat ? styles.catTextActive : null]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.addSchedBtn}
                onPress={() => {
                  if (!newScheduleTitle.trim()) return;
                  const item = {
                    id: Date.now().toString(),
                    title: newScheduleTitle,
                    time: newScheduleTime,
                    completed: false,
                    category: newScheduleCategory
                  };
                  saveSchedule([...schedule, item]);
                  setNewScheduleTitle('');
                }}
              >
                <Text style={styles.addSchedText}>Add Task</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Active Schedule Items</Text>
              {schedule.length === 0 ? (
                <Text style={styles.emptyLogsText}>Your care plan schedule is currently empty.</Text>
              ) : (
                schedule.map(item => (
                  <View key={item.id} style={styles.schedItem}>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = schedule.map(s => s.id === item.id ? { ...s, completed: !s.completed } : s);
                        saveSchedule(updated);
                      }}
                      style={styles.checkBtn}
                    >
                      <Icon name={item.completed ? 'check' : 'plus'} size={16} color={item.completed ? '#4CAF50' : '#A5A5A5'} />
                    </TouchableOpacity>
                    <View style={styles.schedBody}>
                      <Text style={[styles.schedTitle, item.completed ? styles.completedText : null]}>{item.title}</Text>
                      <Text style={styles.schedCat}>{item.category} • {item.time}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = schedule.filter(s => s.id !== item.id);
                        saveSchedule(updated);
                      }}
                    >
                      <Icon name="delete" size={16} color="#FF4B4B" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 3. Vitals & PPG Modal */}
      <Modal visible={activeModal === 'vitals'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📈 Finger PPG Biometrics Scan</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalClose}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {!isScanning ? (
                <View style={styles.vitalsCenterZone}>
                  <TouchableOpacity style={styles.startScanZone} onPress={handleStartPpgScan}>
                    <Icon name="pulse" size={48} color="#FF4B4B" />
                    <Text style={styles.startScanText}>Tap to start biometrics PPG scan</Text>
                  </TouchableOpacity>

                  <Text style={styles.sectionTitle}>Enter Manual Vitals</Text>
                  <View style={styles.manualRow}>
                    <TextInput
                      value={manualBpm}
                      onChangeText={setManualBpm}
                      placeholder="BPM"
                      keyboardType="numeric"
                      style={styles.smallInput}
                    />
                    <TextInput
                      value={manualSpo2}
                      onChangeText={setManualSpo2}
                      placeholder="SpO2%"
                      keyboardType="numeric"
                      style={styles.smallInput}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.addSchedBtn}
                    onPress={() => {
                      const newScan = {
                        id: Date.now().toString(),
                        bpm: parseInt(manualBpm, 10) || 72,
                        bp: manualBp,
                        spo2: parseInt(manualSpo2, 10) || 98,
                        temp: parseFloat(manualTemp) || 98.6,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        status: 'Manual Log'
                      };
                      saveVitalsLog([newScan, ...vitalsLog]);
                    }}
                  >
                    <Text style={styles.addSchedText}>Log Manual Vitals</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.scanningZone}>
                  <Text style={styles.scanningHeader}>{scanProgress}% Completed</Text>
                  <Text style={styles.scanningDesc}>{scanStep}</Text>

                  {/* Fingerprint Interactive Touch Sensor */}
                  <Pressable
                    onPressIn={() => setIsFingerOnScreenSensor(true)}
                    onPressOut={() => setIsFingerOnScreenSensor(false)}
                    style={[
                      styles.fingerSensorCircle,
                      isFingerOnScreenSensor ? styles.fingerSensorCircleActive : null
                    ]}
                  >
                    <Icon name="heart" size={42} color={isFingerOnScreenSensor ? '#FF4B4B' : '#A5A5A5'} />
                    <Text style={styles.sensorText}>
                      {isFingerOnScreenSensor ? 'HOLDING FINGER ON SENSOR' : 'PRESS & HOLD'}
                    </Text>
                  </Pressable>

                  {/* Animated Wave Graph representation */}
                  {isFingerOnScreenSensor && ppgWaveHistory.length > 0 && (
                    <View style={styles.waveGraphContainer}>
                      {ppgWaveHistory.slice(-20).map((v, i) => (
                        <View
                          key={i}
                          style={[
                            styles.waveBar,
                            { height: Math.max(4, Math.min(60, 30 + v)), backgroundColor: '#FF4B4B' }
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}

              <Text style={styles.sectionTitle}>Historic Log Stability</Text>
              {vitalsLog.length === 0 ? (
                <Text style={styles.emptyLogsText}>No diagnostic biometric sweeps performed yet.</Text>
              ) : (
                vitalsLog.map(item => (
                  <View key={item.id} style={styles.vitalItem}>
                    <View style={styles.vitalHeaderRow}>
                      <Text style={styles.vitalBpmText}>💓 {item.bpm} BPM</Text>
                      <Text style={styles.vitalTimeText}>{item.time} ({item.status})</Text>
                    </View>
                    <Text style={styles.vitalSubDetails}>
                      Oxygen: {item.spo2}% • Blood Pressure: {item.bp} • Body Temperature: {item.temp}°{tempUnit}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 4. Daily Activity Modal */}
      <Modal visible={activeModal === 'activity'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔥 Mobility & Steps Target</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalClose}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.activityStatsZone}>
                <Text style={styles.bigSteps}>{activity.steps} Steps</Text>
                <Text style={styles.subStepsGoal}>Goal target: {activity.stepGoal} steps</Text>
              </View>

              <View style={styles.activityDetailsRow}>
                <View style={styles.activityMiniCard}>
                  <Text style={styles.miniCardLabel}>Active Time</Text>
                  <Text style={styles.miniCardVal}>{activity.minutes} min</Text>
                </View>
                <View style={styles.activityMiniCard}>
                  <Text style={styles.miniCardLabel}>Calories Burned</Text>
                  <Text style={styles.miniCardVal}>{activity.calories} kcal</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Adjust Daily Step Target</Text>
              <View style={styles.quickAddRow}>
                {[5000, 8000, 10000, 12000].map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.quickAddBtn, activity.stepGoal === g ? styles.catBtnActive : null]}
                    onPress={() => {
                      const nextAct = { ...activity, stepGoal: g };
                      setActivity(nextAct);
                      storage.setItem('ogoo_activity', JSON.stringify(nextAct));
                    }}
                  >
                    <Text style={styles.quickAddText}>{g / 1000}k Goal</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.addSchedBtn}
                onPress={() => {
                  const incrementSteps = activity.steps + 500;
                  const nextAct = {
                    ...activity,
                    steps: incrementSteps,
                    calories: activity.calories + 22,
                    minutes: activity.minutes + 4
                  };
                  setActivity(nextAct);
                  storage.setItem('ogoo_activity', JSON.stringify(nextAct));
                }}
              >
                <Text style={styles.addSchedText}>Simulate 500 Steps Walk</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 5. Personal Plan Modal */}
      <Modal visible={activeModal === 'plan'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✨ Personal Wellness Plan</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalClose}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.planDocContainer}>
                <Text style={styles.planTextMarkdown}>{customPlan}</Text>
              </View>

              {isGeneratingPlan ? (
                <ActivityIndicator size="large" color="#9D8DF1" style={{ marginVertical: 15 }} />
              ) : (
                <TouchableOpacity style={styles.addSchedBtn} onPress={generateAIPlan}>
                  <Text style={styles.addSchedText}>Tailor Plan with Ogoo AI</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 6. Fall Risk & Safety Modal */}
      <Modal visible={activeModal === 'safety'} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🛡️ Fall Risk & Safety Controls</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)} style={styles.modalClose}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.fallStatusCard}>
                <Text style={styles.fallStatusTitle}>Gait Stability Score</Text>
                <Text style={styles.fallStatusScore}>{safetyMetrics.gaitStability}%</Text>
                <Text style={styles.fallStatusRisk}>Impact Category: {safetyMetrics.fallRisk} Risk</Text>
              </View>

              <TouchableOpacity style={styles.addSchedBtn} onPress={triggerFallTest}>
                <Text style={styles.addSchedText}>Test Impact Fall Signal</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Emergency Medical Contacts</Text>
              <View style={styles.contactCard}>
                <Text style={styles.contactLabel}>Primary Responder</Text>
                <Text style={styles.contactName}>{safetyMetrics.emergencyContactName}</Text>
                <Text style={styles.contactPhone}>Phone: {safetyMetrics.emergencyContactPhone}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Account Profile Sidebar Panel Drawer */}
      <Modal visible={isMenuOpen} animationType="fade" transparent>
        <View style={styles.menuBackdrop}>
          <Pressable style={styles.menuOverlayDismiss} onPress={() => setIsMenuOpen(false)} />
          <View style={styles.menuDrawer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Control Settings</Text>
              <TouchableOpacity onPress={() => setIsMenuOpen(false)}>
                <Icon name="close" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.menuItemsList}>
              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  setVoiceEnabled(!voiceEnabled);
                  storage.setItem('ogoo_voice_enabled', (!voiceEnabled).toString());
                }}
              >
                <Text style={styles.menuItemText}>🗣️ Voice Responses</Text>
                <Text style={styles.menuItemVal}>{voiceEnabled ? 'On' : 'Off'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItemRow}
                onPress={() => {
                  const nextUnit = tempUnit === 'F' ? 'C' : 'F';
                  setTempUnit(nextUnit);
                  storage.setItem('ogoo_temp_unit', nextUnit);
                }}
              >
                <Text style={styles.menuItemText}>🌡️ Temperature Scale</Text>
                <Text style={styles.menuItemVal}>°{tempUnit}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItemRow} onPress={handleClearAccount}>
                <Text style={[styles.menuItemText, { color: '#FF4B4B' }]}>🗑️ Clear Account & History</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuFooter}>
              <Text style={styles.footerBrand}>Ogoo Medical Companion</Text>
              <Text style={styles.footerVer}>v1.2 Native Release</Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#120E21',
  },
  header: {
    height: 70,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1938',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1938',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6C5CE7',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 1.5,
    borderColor: '#120E21',
  },
  titleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  statusText: {
    fontSize: 11,
    color: '#9D8DF1',
    marginTop: 1,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1938',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 85,
  },
  welcomeCard: {
    backgroundColor: '#1E1938',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#342E5E',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 6,
  },
  welcomeDesc: {
    fontSize: 13,
    color: '#E0E0E0',
    lineHeight: 18,
    marginBottom: 16,
  },
  welcomeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#9D8DF1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnIcon: {
    marginRight: 6,
  },
  btnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  btnTextSecondary: {
    color: '#9D8DF1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  widgetCard: {
    backgroundColor: '#1E1938',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  widgetIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  widgetBody: {
    flex: 1,
  },
  widgetRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  widgetTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFF',
  },
  riskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  riskBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  widgetDesc: {
    fontSize: 11,
    color: '#A5A5A5',
    marginTop: 2,
  },
  widgetRight: {
    alignItems: 'flex-end',
    marginRight: 4,
  },
  widgetSub: {
    fontSize: 10,
    color: '#A5A5A5',
  },
  widgetVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#9D8DF1',
    marginTop: 1,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  splitCard: {
    flex: 1,
    backgroundColor: '#1E1938',
    borderRadius: 20,
    padding: 16,
    alignItems: 'flex-start',
  },
  splitIcon: {
    marginBottom: 8,
  },
  splitTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 2,
  },
  splitValText: {
    fontSize: 11,
    color: '#A5A5A5',
  },
  splitLink: {
    fontSize: 11,
    color: '#9D8DF1',
    fontWeight: 'bold',
  },
  collapseContainer: {
    backgroundColor: '#1E1938',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapseTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  collapseToggleBtn: {
    backgroundColor: '#120E21',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  collapseToggleText: {
    fontSize: 11,
    color: '#9D8DF1',
    fontWeight: 'bold',
  },
  collapseBody: {
    marginTop: 12,
    gap: 10,
  },
  collapseMsg: {
    backgroundColor: '#120E21',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(52, 46, 94, 0.5)',
  },
  msgText: {
    fontSize: 13,
    color: '#FFF',
    lineHeight: 18,
  },
  speakRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  speakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E1938',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#342E5E',
  },
  speakButtonText: {
    fontSize: 10,
    color: '#9D8DF1',
    fontWeight: 'bold',
  },
  openChatBtn: {
    height: 40,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  openChatBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  chatContainer: {
    flex: 1,
  },
  chatScroll: {
    padding: 16,
    paddingBottom: 20,
  },
  olderCollapseBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 25, 56, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(52, 46, 94, 0.5)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  olderCollapseText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9D8DF1',
  },
  olderContainer: {
    marginTop: 10,
    gap: 8,
  },
  chatMarkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  markerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(52, 46, 94, 0.4)',
  },
  markerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#A5A5A5',
    textTransform: 'uppercase',
  },
  emptyTodayBox: {
    backgroundColor: '#1E1938',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#342E5E',
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  emptyTodayText: {
    fontSize: 13,
    color: '#FFF',
    lineHeight: 18,
  },
  chatBubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '85%',
    marginBottom: 10,
    position: 'relative',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#6C5CE7',
    borderBottomRightRadius: 2,
  },
  bubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E1938',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  chatBubbleText: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 19,
  },
  bubbleSpeakBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  loadingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E1938',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E1938',
    gap: 10,
  },
  chatInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#1E1938',
    borderRadius: 22,
    paddingHorizontal: 16,
    color: '#FFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingChatBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 14, 33, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#120E21',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: SCREEN_HEIGHT * 0.85,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1938',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1938',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  hydrationStatus: {
    alignItems: 'center',
    marginVertical: 15,
  },
  hydrationHuge: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#6C5CE7',
  },
  hydrationGoal: {
    fontSize: 12,
    color: '#A5A5A5',
    marginTop: 4,
  },
  quickAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 15,
  },
  quickAddBtn: {
    flex: 1,
    minWidth: '22%',
    height: 40,
    backgroundColor: '#1E1938',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#342E5E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddText: {
    fontSize: 12,
    color: '#9D8DF1',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyLogsText: {
    fontSize: 12,
    color: '#A5A5A5',
    fontStyle: 'italic',
    marginVertical: 8,
  },
  logItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1938',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  logText: {
    fontSize: 13,
    color: '#FFF',
  },
  logTime: {
    fontSize: 11,
    color: '#9D8DF1',
  },
  modalInput: {
    height: 44,
    backgroundColor: '#1E1938',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#342E5E',
    marginBottom: 10,
  },
  catRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  catBtn: {
    flex: 1,
    height: 36,
    backgroundColor: '#1E1938',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#342E5E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catBtnActive: {
    backgroundColor: '#6C5CE7',
    borderColor: '#6C5CE7',
  },
  catText: {
    fontSize: 11,
    color: '#9D8DF1',
    fontWeight: 'bold',
  },
  catTextActive: {
    color: '#FFF',
  },
  addSchedBtn: {
    height: 44,
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  addSchedText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
  schedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1938',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  checkBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#120E21',
    borderWidth: 1,
    borderColor: '#342E5E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  schedBody: {
    flex: 1,
  },
  schedTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#A5A5A5',
  },
  schedCat: {
    fontSize: 10,
    color: '#9D8DF1',
    marginTop: 2,
  },
  vitalsCenterZone: {
    alignItems: 'stretch',
  },
  startScanZone: {
    height: 140,
    backgroundColor: '#1E1938',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#342E5E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  startScanText: {
    fontSize: 13,
    color: '#9D8DF1',
    fontWeight: 'bold',
    marginTop: 8,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  smallInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#1E1938',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#342E5E',
    color: '#FFF',
    paddingHorizontal: 12,
    fontSize: 13,
  },
  scanningZone: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  scanningHeader: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF4B4B',
  },
  scanningDesc: {
    fontSize: 12,
    color: '#A5A5A5',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 16,
  },
  fingerSensorCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#1E1938',
    borderWidth: 2,
    borderColor: '#342E5E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  fingerSensorCircleActive: {
    borderColor: '#FF4B4B',
    backgroundColor: 'rgba(255, 75, 75, 0.12)',
  },
  sensorText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: 'bold',
    marginTop: 8,
    textAlign: 'center',
  },
  waveGraphContainer: {
    flexDirection: 'row',
    height: 60,
    gap: 2,
    alignItems: 'flex-end',
    width: SCREEN_WIDTH - 80,
    justifyContent: 'center',
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
  },
  vitalItem: {
    backgroundColor: '#1E1938',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  vitalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vitalBpmText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
  vitalTimeText: {
    fontSize: 10,
    color: '#A5A5A5',
  },
  vitalSubDetails: {
    fontSize: 11,
    color: '#9D8DF1',
    marginTop: 4,
  },
  activityStatsZone: {
    alignItems: 'center',
    marginVertical: 15,
  },
  bigSteps: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#9D8DF1',
  },
  subStepsGoal: {
    fontSize: 12,
    color: '#A5A5A5',
    marginTop: 4,
  },
  activityDetailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  activityMiniCard: {
    flex: 1,
    backgroundColor: '#1E1938',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  miniCardLabel: {
    fontSize: 10,
    color: '#A5A5A5',
    marginBottom: 2,
  },
  miniCardVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
  planDocContainer: {
    backgroundColor: '#1E1938',
    borderWidth: 1,
    borderColor: '#342E5E',
    borderRadius: 18,
    padding: 16,
    marginBottom: 15,
  },
  planTextMarkdown: {
    fontSize: 13,
    color: '#FFF',
    lineHeight: 19,
  },
  fallStatusCard: {
    backgroundColor: '#1E1938',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginVertical: 15,
  },
  fallStatusTitle: {
    fontSize: 12,
    color: '#A5A5A5',
  },
  fallStatusScore: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginVertical: 6,
  },
  fallStatusRisk: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  contactCard: {
    backgroundColor: '#1E1938',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  contactLabel: {
    fontSize: 10,
    color: '#9D8DF1',
  },
  contactName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 2,
  },
  contactPhone: {
    fontSize: 11,
    color: '#A5A5A5',
    marginTop: 2,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
  },
  menuOverlayDismiss: {
    flex: 1,
  },
  menuDrawer: {
    width: SCREEN_WIDTH * 0.75,
    backgroundColor: '#120E21',
    borderLeftWidth: 1,
    borderLeftColor: '#342E5E',
    padding: 20,
    justifyContent: 'space-between',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1938',
    paddingBottom: 15,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFF',
  },
  menuItemsList: {
    flex: 1,
    marginTop: 20,
    gap: 15,
  },
  menuItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
  menuItemVal: {
    fontSize: 12,
    color: '#9D8DF1',
    fontWeight: 'bold',
  },
  menuFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1E1938',
    paddingTop: 15,
    alignItems: 'center',
  },
  footerBrand: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#9D8DF1',
  },
  footerVer: {
    fontSize: 9,
    color: '#A5A5A5',
    marginTop: 2,
  },
});
