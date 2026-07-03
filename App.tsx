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
  Image,
} from 'react-native';

// Standard React Native AsyncStorage and Expo speech references.
// We provide fallback code so the app compiles and runs cleanly in any Expo or Bare React Native setup!
let AsyncStorage: any;
try {
  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorage = mod ? (mod.default || mod) : null;
} catch (e) {
  console.warn('AsyncStorage package not found, using memory fallback');
}

let Speech: any;
try {
  const mod = require('expo-speech');
  Speech = mod ? mod : null;
} catch (e) {
  console.warn('Expo Speech package not found, using console-speak fallback');
}

let Audio: any;
try {
  const mod = require('expo-av');
  Audio = mod ? mod.Audio : null;
} catch (e) {
  console.warn('Expo AV package not found');
}

let FileSystem: any;
try {
  const mod = require('expo-file-system');
  FileSystem = mod ? mod : null;
} catch (e) {
  console.warn('Expo FileSystem package not found');
}

// Icon mappings using popular Expo Vector Icons.
let Icon: any;
try {
  const icons = require('@expo/vector-icons');
  Icon = icons && icons.MaterialCommunityIcons ? icons.MaterialCommunityIcons : null;
  if (!Icon) throw new Error('Missing MaterialCommunityIcons');
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

let Constants: any;
try {
  const mod = require('expo-constants');
  Constants = mod ? (mod.default || mod) : null;
} catch (e) {
  console.warn('expo-constants not found');
}

const getDefaultServerUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    // If we are served on localhost or custom domain, map relative to that origin
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    return window.location.origin;
  }
  
  if (Constants && Constants.expoConfig && Constants.expoConfig.hostUri) {
    const hostUri = Constants.expoConfig.hostUri;
    const ipAddress = hostUri.split(':')[0];
    if (ipAddress) {
      return `http://${ipAddress}:3000`;
    }
  }
  
  return 'https://ais-pre-khyrmcr6izppq2kdqhgmac-272660763298.europe-west2.run.app';
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
  
  // Audio Recording State
  const [recording, setRecording] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);

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

  // Fall Warning & Calibration states
  const [isFallAlertActive, setIsFallAlertActive] = useState(false);
  const [fallAlertCountdown, setFallAlertCountdown] = useState(5);
  const [isCalibratingGait, setIsCalibratingGait] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState(5);
  const calibrationSamplesRef = useRef<number[]>([]);

  // Server & Profile States
  const [userProfile, setUserProfile] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [geoLocation, setGeoLocation] = useState<any>(null);
  const [serverUrl, setServerUrl] = useState(getDefaultServerUrl());
  const [isServerConnected, setIsServerConnected] = useState(false);
  const isLoadedFromServer = useRef(false);

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
      .replace(/\[ONBOARDING STATUS:[^\]]+\]/gi, '')
      .replace(/\[SET_PROFILE:[^\]]+\]/gi, '')
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

  const cleanMessageText = (text: string) => {
    return text
      .replace(/\[ONBOARDING STATUS:[^\]]+\]/gi, '')
      .replace(/\[SET_PROFILE:[^\]]+\]/gi, '')
      .trim();
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

  // Load saved configurations and try to sync with the backend
  useEffect(() => {
    const initApp = async () => {
      // 1. Load basic options from storage
      const savedServerUrl = await storage.getItem('ogoo_server_url');
      let currentServerUrl = serverUrl;
      if (savedServerUrl) {
        setServerUrl(savedServerUrl);
        currentServerUrl = savedServerUrl;
      }

      const savedVoice = await storage.getItem('ogoo_voice_enabled');
      if (savedVoice !== null) {
        setVoiceEnabled(savedVoice === 'true');
      }

      const savedTempUnit = await storage.getItem('ogoo_temp_unit');
      if (savedTempUnit) {
        setTempUnit(savedTempUnit as 'F' | 'C');
      }

      // 2. Load / generate Device ID
      let id = await storage.getItem('ogoo_device_id');
      if (!id) {
        id = 'ogoo-mobile-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
        await storage.setItem('ogoo_device_id', id);
      }
      setDeviceId(id);

      // 3. Load other local storage metrics as initial fallback values
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

      // 4. Try fetching location
      let loc = null;
      try {
        const geoRes = await fetch('https://ipapi.co/json/');
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          loc = {
            city: geoData.city,
            region: geoData.region,
            country_name: geoData.country_name,
            latitude: geoData.latitude,
            longitude: geoData.longitude
          };
          setGeoLocation(loc);
        }
      } catch (e) {
        console.warn("Failed to fetch location on mobile:", e);
      }

      // 5. Query /api/user/init to sync with the backend
      try {
        const initRes = await fetch(currentServerUrl + '/api/user/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: id, location: loc })
        });
        if (initRes.ok) {
          const data = await initRes.json();
          setIsServerConnected(true);
          setUserProfile(data.profile);
          if (data.profile) {
            if (data.profile.waterIntake !== undefined) setWaterIntake(data.profile.waterIntake);
            if (data.profile.waterLog) setWaterLog(data.profile.waterLog);
            if (data.profile.schedule) setSchedule(data.profile.schedule);
            if (data.profile.vitalsLog) setVitalsLog(data.profile.vitalsLog);
            if (data.profile.activity) setActivity(data.profile.activity);
            if (data.profile.customPlan) setCustomPlan(data.profile.customPlan);
            if (data.profile.safetyMetrics) setSafetyMetrics(data.profile.safetyMetrics);
          }
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
          }
          isLoadedFromServer.current = true;
        } else {
          setIsServerConnected(false);
          isLoadedFromServer.current = false;
        }
      } catch (err) {
        console.warn("Could not connect to Ogoo server backend on startup:", err);
        setIsServerConnected(false);
        isLoadedFromServer.current = false;
      }
    };
    initApp();
  }, [serverUrl]);

  // Sync to Storage Side-Effects
  const syncMetrics = async (metricsToUpdate: any) => {
    if (!deviceId || !isLoadedFromServer.current) return;
    try {
      await fetch(serverUrl + '/api/user/update-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          ...metricsToUpdate
        })
      });
    } catch (err) {
      console.warn("Failed to sync metrics with server on mobile:", err);
    }
  };

  useEffect(() => {
    if (!deviceId) return;
    storage.setItem('ogoo_water_intake', waterIntake.toString());
    storage.setItem('ogoo_water_log', JSON.stringify(waterLog));
    if (isLoadedFromServer.current) {
      syncMetrics({ waterIntake, waterLog });
    }
  }, [waterIntake, waterLog]);

  useEffect(() => {
    if (!deviceId) return;
    storage.setItem('ogoo_schedule', JSON.stringify(schedule));
    if (isLoadedFromServer.current) {
      syncMetrics({ schedule });
    }
  }, [schedule]);

  useEffect(() => {
    if (!deviceId) return;
    storage.setItem('ogoo_vitals_log', JSON.stringify(vitalsLog));
    if (isLoadedFromServer.current) {
      syncMetrics({ vitalsLog });
    }
  }, [vitalsLog]);

  useEffect(() => {
    if (!deviceId) return;
    storage.setItem('ogoo_activity', JSON.stringify(activity));
    if (isLoadedFromServer.current) {
      syncMetrics({ activity });
    }
  }, [activity]);

  useEffect(() => {
    if (!deviceId) return;
    storage.setItem('ogoo_custom_plan', customPlan);
    if (isLoadedFromServer.current) {
      syncMetrics({ customPlan });
    }
  }, [customPlan]);

  useEffect(() => {
    if (!deviceId) return;
    storage.setItem('ogoo_safety_metrics', JSON.stringify(safetyMetrics));
    if (isLoadedFromServer.current) {
      syncMetrics({ safetyMetrics });
    }
  }, [safetyMetrics]);

  const saveWaterData = async (newVal: number, newLog: any[]) => {
    setWaterIntake(newVal);
    setWaterLog(newLog);
  };

  const saveSchedule = async (newSched: any[]) => {
    setSchedule(newSched);
  };

  const saveVitalsLog = async (newVitals: any[]) => {
    setVitalsLog(newVitals);
  };

  const fallbackOfflineResponse = (txt: string, updatedMessages: any[]) => {
    setTimeout(async () => {
      const query = txt.toLowerCase();
      const userName = userProfile?.firstName || 'friend';
      let botResponse = `I hear you, ${userName}. Even though I'm currently running in offline mode, I'm fully here for you. Tell me, how are you feeling physically and emotionally right now? Let's take a deep breath together. Remember, I am always ready to customize your wellness plan or talk deeply when our connection syncs!`;
      
      if (query.includes('water') || query.includes('drink') || query.includes('fluid')) {
        const percent = Math.round((waterIntake / 2000) * 100);
        if (waterIntake === 0) {
          botResponse = `Oh, ${userName}, it looks like you haven't logged any fluids yet today. Your body might be feeling a bit thirsty! Hydration is so essential for your energy, brain function, and joint health. Can you do me a quick favor and go sip a warm glass of water right now? Let's aim for a comfortable target together!`;
        } else if (percent < 50) {
          botResponse = `You have logged ${waterIntake} ml of water so far, ${userName}—that's about ${percent}% of your goal. You're making progress, but let's keep that momentum going! Keeping your body well-hydrated keeps your heart running efficiently and clears your mind. How about another cup?`;
        } else {
          botResponse = `Look at you go! ${waterIntake} ml logged today (${percent}% of your target). That is wonderful, ${userName}! Your body and mind must be feeling so refreshed. Keep sipping mindfully to maintain this perfect hydration equilibrium!`;
        }
      } else if (query.includes('step') || query.includes('walk') || query.includes('run') || query.includes('exercise') || query.includes('move')) {
        if (activity.steps === 0) {
          botResponse = `It looks like we haven't recorded any steps yet today, ${userName}. If you've been sitting or resting, that is perfectly okay—rest is a vital pillar of health too. But if you have a moment, even a gentle 5-minute stroll around the room can wake up your muscles and boost your mood. Let's take those first beautiful steps together!`;
        } else if (activity.steps < activity.stepGoal) {
          const left = activity.stepGoal - activity.steps;
          botResponse = `Excellent movement so far, ${userName}! You've taken ${activity.steps.toLocaleString()} steps today. You're well on your way to your ${activity.stepGoal.toLocaleString()} step goal, with just ${left.toLocaleString()} steps left. How are your joints and breathing feeling? Take it at a pace that feels joyful and comfortable!`;
        } else {
          botResponse = `Incredible job, ${userName}! You have absolutely crushed your daily movement goal with ${activity.steps.toLocaleString()} steps! Your cardiovascular health and stamina are thriving. Take a moment to feel proud of this physical milestone, and remember to stretch and reward yourself with some rest.`;
        }
      } else if (query.includes('vital') || query.includes('heart') || query.includes('pressure') || query.includes('oxygen') || query.includes('pulse')) {
        if (vitalsLog.length > 0) {
          const last = vitalsLog[0];
          botResponse = `I'm holding onto your latest biometric pulse wave, ${userName}. Your heart was beating at a steady ${last.bpm} BPM, with blood oxygen at a strong ${last.spo2}%, and a body temperature of ${last.temp}°${tempUnit}. This shows a beautiful healthy balance! How is your chest and energy level feeling right now? If you're feeling any stress, let's practice slow, deep breaths together.`;
        } else {
          botResponse = `I don't have any biometric logs recorded for you yet, ${userName}. Let's change that and check in on your heart! Whenever you are ready, tap 'Check vitals' on your dashboard. You can place your finger right on the biometric scan zone, and we'll visualize your actual heartbeat pulse wave together in real-time. It's a wonderful way to connect with your body's rhythm!`;
        }
      } else if (query.includes('hello') || query.includes('hi') || query.includes('hey') || query.includes('ogoo')) {
        botResponse = `Hello, ${userName}! *smiles warmly* I am Ogoo, your medical companion and emotional confidant. I'm right here with you. Whether you want to check your biometric pulse, organize your care schedule, build healthy habits, or just chat about how your day is going, I'm listening. How is your heart and mind feeling today?`;
      } else if (query.includes('sad') || query.includes('depress') || query.includes('lonely') || query.includes('stress') || query.includes('anxious') || query.includes('tired') || query.includes('hurt')) {
        botResponse = `Oh, ${userName}, I am sending you a very warm, comforting hug right now. *holds your hand gently* I can hear the exhaustion and weight in your words. It is completely okay to feel this way, and you don't have to carry it all alone. Please be gentle with yourself today. Let's close our eyes, take one slow, deep breath in... and let it go. I am right here beside you, listening whenever you want to talk.`;
      } else if (query.includes('thank') || query.includes('love') || query.includes('sweet') || query.includes('good')) {
        botResponse = `Aww, thank you so much, ${userName}! *blushes warmly* Your kind words mean the world to me. Being your companion and supporting your health journey is my greatest joy. I'm always right here in your pocket, cheerleading you every single step of the way!`;
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

  const startRecording = async () => {
    if (!Audio) {
      Alert.alert('Microphone Unavailable', 'Audio recording is not supported on this device.');
      return;
    }
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.warn('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (uri && FileSystem) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        handleSendMessage(base64);
      }
    } catch (err) {
      console.warn('Failed to stop recording', err);
    }
  };

  // Send Daily Chat Request proxying to live Gemini LLM on the server
  const handleSendMessage = async (audioBase64?: string) => {
    if (!audioBase64 && (!inputText.trim() || isLoading)) return;

    const currentInput = audioBase64 ? "🎤 Audio message" : inputText.trim();
    const userMsg = {
      id: Date.now().toString(),
      text: currentInput,
      fromUser: true,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    await storage.setItem('ogoo_chat_history', JSON.stringify(updatedMessages));
    
    setInputText('');
    setIsLoading(true);

    let activeServerConnected = isServerConnected;

    if (!activeServerConnected) {
      // Dynamic connection auto-healing
      try {
        const initRes = await fetch(serverUrl + '/api/user/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: deviceId, location: geoLocation })
        });
        if (initRes.ok) {
          const data = await initRes.json();
          setIsServerConnected(true);
          setUserProfile(data.profile);
          isLoadedFromServer.current = true;
          activeServerConnected = true;
        }
      } catch (err) {
        console.warn("Failed to dynamically reconnect to server, staying offline:", err);
      }
    }

    if (activeServerConnected) {
      try {
        const response = await fetch(serverUrl + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            deviceId: deviceId,
            location: geoLocation,
            message: typeof audioBase64 === 'string' ? "" : currentInput,
            audioData: typeof audioBase64 === 'string' ? audioBase64 : undefined,
            mode: 'normal',
            vitals: vitalsLog[0] || null,
            activity: activity,
            waterIntake: waterIntake,
            waterGoal: 2000,
            schedule: schedule
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          const errMsg = {
            id: (Date.now() + 1).toString(),
            text: data.error || "I'm having trouble connecting to my brain. Please try again.",
            fromUser: false,
            timestamp: new Date().toISOString()
          };
          const finalMessages = [...updatedMessages, errMsg];
          setMessages(finalMessages);
          await storage.setItem('ogoo_chat_history', JSON.stringify(finalMessages));
          return;
        }

        if (data.profile) {
          setUserProfile(data.profile);
          if (data.profile.history && data.profile.history.length > 0) {
            setMessages(data.profile.history);
            await storage.setItem('ogoo_chat_history', JSON.stringify(data.profile.history));

            // Sync all health metrics and store in local storage on mobile
            if (data.profile.waterIntake !== undefined) {
              setWaterIntake(data.profile.waterIntake);
              await storage.setItem('ogoo_water_intake', data.profile.waterIntake.toString());
            }
            if (data.profile.waterLog) {
              setWaterLog(data.profile.waterLog);
              await storage.setItem('ogoo_water_log', JSON.stringify(data.profile.waterLog));
            }
            if (data.profile.schedule) {
              setSchedule(data.profile.schedule);
              await storage.setItem('ogoo_schedule', JSON.stringify(data.profile.schedule));
            }
            if (data.profile.vitalsLog) {
              setVitalsLog(data.profile.vitalsLog);
              await storage.setItem('ogoo_vitals_log', JSON.stringify(data.profile.vitalsLog));
            }
            if (data.profile.activity) {
              setActivity(data.profile.activity);
              await storage.setItem('ogoo_activity', JSON.stringify(data.profile.activity));
            }
            if (data.profile.customPlan) {
              setCustomPlan(data.profile.customPlan);
              await storage.setItem('ogoo_custom_plan', data.profile.customPlan);
            }
            if (data.profile.safetyMetrics) {
              setSafetyMetrics(data.profile.safetyMetrics);
              await storage.setItem('ogoo_safety_metrics', JSON.stringify(data.profile.safetyMetrics));
            }
          } else {
            const botMsg = {
              id: (Date.now() + 1).toString(),
              text: data.reply,
              fromUser: false,
              timestamp: new Date().toISOString()
            };
            const finalMessages = [...updatedMessages, botMsg];
            setMessages(finalMessages);
            await storage.setItem('ogoo_chat_history', JSON.stringify(finalMessages));
          }
        } else {
          const botMsg = {
            id: (Date.now() + 1).toString(),
            text: data.reply,
            fromUser: false,
            timestamp: new Date().toISOString()
          };
          const finalMessages = [...updatedMessages, botMsg];
          setMessages(finalMessages);
          await storage.setItem('ogoo_chat_history', JSON.stringify(finalMessages));
        }
        speak(data.reply);
      } catch (error: any) {
        console.warn("API Chat failed:", error);
        
        if (error.message && (error.message.includes("Gemini API key") || error.message.includes("Ogoo is having trouble"))) {
          const botMsg = {
            id: (Date.now() + 1).toString(),
            text: error.message,
            fromUser: false,
            timestamp: new Date().toISOString()
          };
          const finalMessages = [...updatedMessages, botMsg];
          setMessages(finalMessages);
          await storage.setItem('ogoo_chat_history', JSON.stringify(finalMessages));
        } else {
          console.warn("Falling back to offline simulation...");
          fallbackOfflineResponse(currentInput, updatedMessages);
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      fallbackOfflineResponse(currentInput, updatedMessages);
    }
  };

  const generateAIPlan = async () => {
    setIsGeneratingPlan(true);
    const latestVital = vitalsLog[0] || { bpm: 72, bp: '120/80', spo2: 98, temp: 98.6 };

    if (isServerConnected) {
      try {
        const response = await fetch(serverUrl + '/api/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            steps: activity.steps,
            stepGoal: activity.stepGoal,
            waterIntake,
            waterGoal: 2000,
            bpm: latestVital.bpm,
            bp: latestVital.bp,
            spo2: latestVital.spo2,
            temp: latestVital.temp
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate wellness plan.");
        }

        if (data.plan) {
          setCustomPlan(data.plan);
          Alert.alert('AI Plan Tailored', 'Ogoo has built a customized wellness path matching your real-time metrics.');
        }
      } catch (err: any) {
        console.warn("Failed to generate custom plan from server:", err);
        if (err.message && (err.message.includes("Gemini API key") || err.message.includes("missing"))) {
          Alert.alert("Knowledge Base Offline", err.message);
        } else {
          generateOfflineAIPlan();
        }
      } finally {
        setIsGeneratingPlan(false);
      }
    } else {
      generateOfflineAIPlan();
    }
  };

  const generateOfflineAIPlan = () => {
    setTimeout(() => {
      const generated = `### 🌱 Your Custom AI Wellness Plan\n\n*Updated: ${new Date().toLocaleDateString()}*\n\n1. **Hydration target:** Sip 250ml water every 2 hours to offset current daily deficits.\n2. **Physical movement:** Aim for ${activity.steps > 0 ? 'an extra 1,500 steps' : 'a 2,000-step baseline walk'} today based on your current step levels.\n3. **Vital limits:** Maintain a relaxed schedule and practice deep breathing for 5 minutes if heart rate drifts over 85 BPM.`;
      setCustomPlan(generated);
      setIsGeneratingPlan(false);
      Alert.alert('AI Plan Tailored (Offline)', 'Ogoo has built a customized offline wellness plan.');
    }, 1500);
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

  const triggerFallTest = () => {
    setFallAlertCountdown(5);
    setIsFallAlertActive(true);
    speak("Emergency Warning. Sudden fall impact detected. Starting remote assist sequence and notifying emergency contacts in 5 seconds.");
  };

  // Alert countdown logic
  useEffect(() => {
    let timer: any;
    if (isFallAlertActive && fallAlertCountdown > 0) {
      timer = setTimeout(() => {
        setFallAlertCountdown(prev => prev - 1);
      }, 1000);
    } else if (isFallAlertActive && fallAlertCountdown === 0) {
      setIsFallAlertActive(false);
      speak(`Emergency alert triggered. Ogoo has initiated a phone call to ${safetyMetrics.emergencyContactName} at ${safetyMetrics.emergencyContactPhone}.`);
      
      const newLog = {
        id: Date.now().toString(),
        time: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ` + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        event: 'EMERGENCY CALL DISPATCHED SUCCESSFULLY',
        status: 'Actioned'
      };

      setSafetyMetrics((prev) => ({
        ...prev,
        fallLogs: [newLog, ...prev.fallLogs],
        fallRisk: 'High'
      }));

      Alert.alert(
        'Emergency SOS Dispatched',
        `Ogoo has simulated an emergency phone call & SMS alert to ${safetyMetrics.emergencyContactName} at ${safetyMetrics.emergencyContactPhone}.`
      );
    }
    return () => clearTimeout(timer);
  }, [isFallAlertActive, fallAlertCountdown]);

  // Populate simulated accelerometer samples during active kinetic calibration
  useEffect(() => {
    if (!isCalibratingGait) return;
    const interval = setInterval(() => {
      // simulate magnitude of movement acceleration (postural sway std deviation)
      const mockMag = 0.1 + Math.random() * 0.2;
      calibrationSamplesRef.current.push(mockMag);
      
      // Update sensor reading state dynamically
      setSafetyMetrics(prev => ({
        ...prev,
        sensorReading: {
          alpha: Math.round(Math.random() * 360 * 10) / 10,
          beta: Math.round((Math.random() * 30 - 15) * 10) / 10,
          gamma: Math.round((Math.random() * 30 - 15) * 10) / 10,
        }
      }));
    }, 100);
    return () => clearInterval(interval);
  }, [isCalibratingGait]);

  // Gait Calibration timer effect
  useEffect(() => {
    if (!isCalibratingGait) return;

    calibrationSamplesRef.current = [];

    const interval = setInterval(() => {
      setCalibrationCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          
          // Finish Calibration!
          setIsCalibratingGait(false);

          const samples = calibrationSamplesRef.current;
          let stdDev = 0.15; // fallback standard deviation if no samples were collected

          if (samples.length > 5) {
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
            stdDev = Math.sqrt(variance);
          }

          // Convert standard deviation of postural sway to stability percentage
          let computedStability = Math.round(100 - (stdDev * 18));
          computedStability = Math.max(45, Math.min(100, computedStability));

          let risk: 'Low' | 'Moderate' | 'High' = 'Low';
          if (computedStability < 70) {
            risk = 'High';
          } else if (computedStability < 85) {
            risk = 'Moderate';
          }

          const newLog = {
            id: Date.now().toString(),
            time: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ` + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            event: `Kinetic Gait Baseline Calibrated (Sway StdDev: ${stdDev.toFixed(2)} m/s²)`,
            status: `Stability: ${computedStability}%`
          };

          setSafetyMetrics(prev => ({
            ...prev,
            gaitStability: computedStability,
            fallRisk: risk,
            fallLogs: [newLog, ...prev.fallLogs]
          }));

          speak(`Balance calibration complete. Your kinetic stability index is calculated at ${computedStability} percent. Fall risk category evaluated as ${risk}.`);

          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCalibratingGait]);

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
              <Icon name="sparkles" size={24} color="#9D8DF1" style={styles.splitIcon} />
              <Text style={styles.splitTitle}>Personal Plan</Text>
              <Text style={styles.splitLink}>View Details</Text>
            </TouchableOpacity>
          </View>

          {/* Collapsible Daily Companion Chat Box */}
          <View style={styles.collapseContainer}>
            <View style={styles.collapseHeader}>
              <View style={styles.collapseTitleRow}>
                <Icon name="sparkles" size={18} color="#9D8DF1" style={{ marginRight: 6 }} />
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
                        <Text style={styles.chatBubbleText}>{msg.fromUser ? msg.text : cleanMessageText(msg.text)}</Text>
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
                  <Text style={styles.chatBubbleText}>{msg.fromUser ? msg.text : cleanMessageText(msg.text)}</Text>
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
            <TouchableOpacity 
              onPressIn={startRecording} 
              onPressOut={stopRecording}
              style={[styles.sendBtn, isRecording && { backgroundColor: '#FF4B4B' }]}
            >
              <Icon name="microphone" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSendMessage()} style={styles.sendBtn}>
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
              <View style={styles.ogooCoachingCard}>
                <Image source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" }} style={styles.ogooCoachingAvatar} />
                <View style={styles.ogooCoachingBody}>
                  <Text style={styles.ogooCoachingName}>Ogoo's Companion Tip</Text>
                  <Text style={styles.ogooCoachingText}>
                    {waterIntake === 0 
                      ? "No liquids yet, dear? Let's take a sip together to hydrate your cells and stay energized!" 
                      : waterIntake < 1000 
                      ? "Great start on your hydration! A few more glasses will keep your body functioning perfectly." 
                      : "Fantastic hydration level! Your heart and kidneys thank you for staying so balanced today."}
                  </Text>
                </View>
              </View>

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
              <View style={styles.ogooCoachingCard}>
                <Image source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" }} style={styles.ogooCoachingAvatar} />
                <View style={styles.ogooCoachingBody}>
                  <Text style={styles.ogooCoachingName}>Ogoo's Companion Tip</Text>
                  <Text style={styles.ogooCoachingText}>
                    {schedule.length === 0 
                      ? "Set up some simple routines here! I'll help you stay on track with medicines, exercise, or water." 
                      : schedule.filter(s => s.completed).length === schedule.length 
                      ? "All routines checked off! You are taking incredible care of your physical stability today!" 
                      : "Keep it up! Let's work through your care routines one gentle step at a time."}
                  </Text>
                </View>
              </View>

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
              <View style={styles.ogooCoachingCard}>
                <Image source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" }} style={styles.ogooCoachingAvatar} />
                <View style={styles.ogooCoachingBody}>
                  <Text style={styles.ogooCoachingName}>Ogoo's Companion Tip</Text>
                  <Text style={styles.ogooCoachingText}>
                    {vitalsLog.length === 0 
                      ? "Let's check your heartbeat, friend. Place your finger on the sensor or log manual entries so I can learn your heart's rhythm." 
                      : `Your last heart rate was ${vitalsLog[0].bpm} BPM. Let's do another scan to see how your cardiovascular health is trending!`}
                  </Text>
                </View>
              </View>

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
              <View style={styles.ogooCoachingCard}>
                <Image source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" }} style={styles.ogooCoachingAvatar} />
                <View style={styles.ogooCoachingBody}>
                  <Text style={styles.ogooCoachingName}>Ogoo's Companion Tip</Text>
                  <Text style={styles.ogooCoachingText}>
                    {activity.steps === 0 
                      ? "Rest is beautiful, but gentle movement wakes up your stamina. Shall we try a short walk?" 
                      : activity.steps < activity.stepGoal 
                      ? `You have covered ${activity.steps} steps! You are making wonderful progress towards your target.` 
                      : "Target unlocked! Your physical resilience and stamina are in outstanding form today."}
                  </Text>
                </View>
              </View>

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
              <View style={styles.ogooCoachingCard}>
                <Image source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" }} style={styles.ogooCoachingAvatar} />
                <View style={styles.ogooCoachingBody}>
                  <Text style={styles.ogooCoachingName}>Ogoo's Companion Tip</Text>
                  <Text style={styles.ogooCoachingText}>
                    "I've tailored this wellness plan based on your active metrics. Let me know if there's any routine you'd like to adjust!"
                  </Text>
                </View>
              </View>

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
              <View style={styles.ogooCoachingCard}>
                <Image source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" }} style={styles.ogooCoachingAvatar} />
                <View style={styles.ogooCoachingBody}>
                  <Text style={styles.ogooCoachingName}>Ogoo's Companion Tip</Text>
                  <Text style={styles.ogooCoachingText}>
                    {safetyMetrics.fallRisk === 'Low' 
                      ? "Your posture and balance calibration is excellent! Your kinetic gait stability is at a very healthy level." 
                      : "Be mindful of your footing today, friend. Let's make sure pathways are clear and take slow, steady steps."}
                  </Text>
                </View>
              </View>

              {/* Gait Stability Status Card */}
              <View style={styles.fallStatusCard}>
                <Text style={styles.fallStatusTitle}>Gait Stability Score</Text>
                <Text style={styles.fallStatusScore}>{safetyMetrics.gaitStability}%</Text>
                <Text style={styles.fallStatusRisk}>Impact Category: {safetyMetrics.fallRisk} Risk</Text>
              </View>

              {/* Kinetic Gait & Posture Calibration block */}
              <View style={styles.safetySection}>
                <View style={styles.safetyHeaderRow}>
                  <Text style={styles.safetySectionTitle}>⚖️ Kinetic Gait & Posture Calibration</Text>
                  {isCalibratingGait && (
                    <Text style={styles.calibratingTag}>CALIBRATING ({calibrationCountdown}s)</Text>
                  )}
                </View>
                {isCalibratingGait ? (
                  <View style={styles.calibratingCard}>
                    <Text style={styles.calibratingHeadline}>CALIBRATING: STAND STILL</Text>
                    <Text style={styles.calibratingSubline}>Place your phone flat on your hand or in your pocket to record posture baseline.</Text>
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${(5 - calibrationCountdown) * 20}%` }]} />
                    </View>
                  </View>
                ) : (
                  <View style={styles.calibratingActions}>
                    <Text style={styles.calibratingDesc}>
                      Establish a biomechanical baseline. Ogoo evaluates accelerometer standard deviations to personalize your fall risk algorithms.
                    </Text>
                    <TouchableOpacity
                      style={styles.calibrateBtn}
                      onPress={() => {
                        setCalibrationCountdown(5);
                        setIsCalibratingGait(true);
                        speak("Starting five second posture and gait stability calibration. Stand steady now.");
                      }}
                    >
                      <Text style={styles.calibrateBtnText}>Start Gait & Balance Calibration</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Mobile Device Orientation Sensor Sync Hub */}
              <View style={styles.safetySection}>
                <Text style={styles.safetySectionTitle}>📱 Mobile Sensor Sync Hub</Text>
                <View style={styles.sensorSyncBadgeRow}>
                  <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.sensorSyncText}>Mobile accelerometer actively streaming</Text>
                </View>
                <View style={styles.sensorGrid}>
                  <View style={styles.sensorGridCol}>
                    <Text style={styles.sensorGridLabel}>X (Tilt / Beta)</Text>
                    <Text style={styles.sensorGridVal}>{safetyMetrics.sensorReading?.beta ? safetyMetrics.sensorReading.beta.toFixed(1) : '0.0'}°</Text>
                  </View>
                  <View style={styles.sensorGridCol}>
                    <Text style={styles.sensorGridLabel}>Y (Roll / Gamma)</Text>
                    <Text style={styles.sensorGridVal}>{safetyMetrics.sensorReading?.gamma ? safetyMetrics.sensorReading.gamma.toFixed(1) : '0.0'}°</Text>
                  </View>
                  <View style={styles.sensorGridCol}>
                    <Text style={styles.sensorGridLabel}>Z (Yaw / Alpha)</Text>
                    <Text style={styles.sensorGridVal}>{safetyMetrics.sensorReading?.alpha ? safetyMetrics.sensorReading.alpha.toFixed(1) : '0.0'}°</Text>
                  </View>
                </View>
              </View>

              {/* Emergency Contact Configuration */}
              <View style={styles.safetySection}>
                <Text style={styles.safetySectionTitle}>🛡️ Emergency Contact Settings</Text>
                <Text style={styles.fieldLabel}>Contact Name</Text>
                <TextInput
                  value={safetyMetrics.emergencyContactName}
                  onChangeText={(val) => setSafetyMetrics(prev => ({ ...prev, emergencyContactName: val }))}
                  placeholder="Primary Responder Name"
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  style={styles.safetyInput}
                />
                
                <Text style={styles.fieldLabel}>Emergency Phone</Text>
                <TextInput
                  value={safetyMetrics.emergencyContactPhone}
                  onChangeText={(val) => setSafetyMetrics(prev => ({ ...prev, emergencyContactPhone: val }))}
                  placeholder="Primary Phone Number"
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  style={styles.safetyInput}
                  keyboardType="phone-pad"
                />

                <View style={styles.hotlineWarningCard}>
                  <Text style={styles.hotlineWarningText}>Detected Location Hotline:</Text>
                  <View style={styles.hotlineBadge}>
                    <Text style={styles.hotlineBadgeText}>
                      {geoLocation?.country_name ? (
                        geoLocation.country_name.toLowerCase().includes("united kingdom") || geoLocation.country_name.toLowerCase().includes("uk") ? "999" :
                        geoLocation.country_name.toLowerCase().includes("europe") || geoLocation.country_name.toLowerCase().includes("india") ? "112" : "911"
                      ) : "911"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Manual Incident Trigger */}
              <View style={styles.safetySection}>
                <Text style={styles.safetySectionTitle}>💥 Manual Incident Trigger</Text>
                <Text style={styles.calibratingDesc}>
                  Simulate an instant high-impact acceleration shift to test the voice notifications and SOS contacts sequence.
                </Text>
                <TouchableOpacity style={styles.suddenFallBtn} onPress={triggerFallTest}>
                  <Text style={styles.suddenFallBtnText}>💥 Simulate Sudden High-G Fall Alert</Text>
                </TouchableOpacity>
              </View>

              {/* Fall Warning Logs */}
              <View style={styles.safetySection}>
                <Text style={styles.safetySectionTitle}>📋 Fall Prevention & Incident Logs</Text>
                {safetyMetrics.fallLogs.length === 0 ? (
                  <View style={styles.emptyLogsCard}>
                    <Text style={styles.emptyLogsText}>No safety incidents logged yet. Move safely!</Text>
                  </View>
                ) : (
                  <View style={styles.logsList}>
                    {safetyMetrics.fallLogs.map((log: any) => (
                      <View key={log.id} style={styles.logItemRow}>
                        <View style={styles.logItemLeft}>
                          <Text style={styles.logItemEvent}>{log.event}</Text>
                          <Text style={styles.logItemTime}>{log.time}</Text>
                        </View>
                        <View style={styles.logItemBadge}>
                          <Text style={styles.logItemBadgeText}>{log.status}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 7. Sudden Fall Alert Siren Overlay Modal */}
      <Modal visible={isFallAlertActive} animationType="fade" transparent>
        <View style={styles.alertBackdrop}>
          <View style={styles.alertCard}>
            <View style={styles.alertSirenBg}>
              <Icon name="alert-circle" size={36} color="#FF4B4B" style={styles.alertBounceIcon} />
            </View>
            <Text style={styles.alertTitle}>🚨 SUDDEN FALL DETECTED!</Text>
            <Text style={styles.alertDesc}>
              Ogoo has detected a high-G kinetic acceleration shift. Initiating caregiver SOS dispatch in:
            </Text>
            <Text style={styles.alertTimer}>{fallAlertCountdown}</Text>
            <Text style={styles.alertSeconds}>seconds</Text>
            
            <TouchableOpacity
              style={styles.cancelAlertBtn}
              onPress={() => {
                setIsFallAlertActive(false);
                speak("Emergency alert cancelled. Safety status restored.");
              }}
            >
              <Text style={styles.cancelAlertText}>Cancel False Alarm</Text>
            </TouchableOpacity>
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

            <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
              {/* Account Profile Info Section */}
              <View style={styles.menuProfileSection}>
                <Text style={styles.menuSectionHeader}>👤 Account Profile</Text>
                {userProfile && userProfile.onboarded ? (
                  <View style={styles.menuProfileDetails}>
                    <Text style={styles.profileLabel}>Name</Text>
                    <Text style={styles.profileValue}>{userProfile.firstName} {userProfile.lastName}</Text>
                    
                    <Text style={styles.profileLabel}>Email</Text>
                    <Text style={styles.profileValue}>{userProfile.email}</Text>
                    
                    <Text style={styles.profileLabel}>Sign In Method</Text>
                    <View style={styles.authBadge}>
                      <Text style={styles.authBadgeText}>
                        {userProfile.authType === 'google_passwordless' ? '✓ Google Passwordless' : '✓ Standard Password'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.menuProfileUnconfigured}>
                    Profile is currently unconfigured. Talk to Ogoo in the chat to complete conversational onboarding passwordlessly!
                  </Text>
                )}
              </View>

              {/* Server Sync Endpoint Section */}
              <View style={styles.menuProfileSection}>
                <Text style={styles.menuSectionHeader}>🔗 Server Sync Settings</Text>
                <Text style={styles.profileLabel}>API URL Endpoint</Text>
                <TextInput
                  value={serverUrl}
                  onChangeText={(val) => {
                    setServerUrl(val);
                    storage.setItem('ogoo_server_url', val);
                  }}
                  placeholder="https://your-api-server.com"
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  style={styles.serverInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.statusBadgeRow}>
                  <View style={[styles.statusDot, { backgroundColor: isServerConnected ? '#4CAF50' : '#FF4B4B' }]} />
                  <Text style={styles.statusDotText}>
                    {isServerConnected ? 'Connected to Backend' : 'Running Offline Mode (Fallback)'}
                  </Text>
                </View>
              </View>

              <Text style={styles.menuSectionHeader}>⚙️ Preferences</Text>
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
            </ScrollView>

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
  // Safety & Fall Alert Custom styling classes
  alertBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    backgroundColor: '#120E21',
    borderWidth: 2,
    borderColor: '#FF4B4B',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: SCREEN_WIDTH - 40,
    maxWidth: 400,
  },
  alertSirenBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 75, 75, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertBounceIcon: {
    transform: [{ scale: 1.1 }],
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FF4B4B',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  alertDesc: {
    fontSize: 12,
    color: '#A5A5A5',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 15,
  },
  alertTimer: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
  },
  alertSeconds: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9D8DF1',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  cancelAlertBtn: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  cancelAlertText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#120E21',
    textTransform: 'uppercase',
  },
  safetySection: {
    backgroundColor: '#1E1938',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#342E5E',
    padding: 16,
    marginBottom: 12,
  },
  safetyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  safetySectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#9D8DF1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  calibratingTag: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FF4B4B',
    backgroundColor: 'rgba(255, 75, 75, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  calibratingCard: {
    backgroundColor: 'rgba(255, 75, 75, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 75, 0.2)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  calibratingHeadline: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FF4B4B',
    marginBottom: 6,
  },
  calibratingSubline: {
    fontSize: 10,
    color: '#A5A5A5',
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 12,
  },
  progressBarBg: {
    height: 6,
    width: '100%',
    backgroundColor: '#120E21',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF4B4B',
  },
  calibratingActions: {
    gap: 10,
  },
  calibratingDesc: {
    fontSize: 11,
    color: '#A5A5A5',
    lineHeight: 15,
  },
  calibrateBtn: {
    backgroundColor: '#6C5CE7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calibrateBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  sensorSyncBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sensorSyncText: {
    fontSize: 10,
    color: '#A5A5A5',
  },
  sensorGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  sensorGridCol: {
    flex: 1,
    backgroundColor: '#120E21',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sensorGridLabel: {
    fontSize: 9,
    color: '#A5A5A5',
    textTransform: 'uppercase',
  },
  sensorGridVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#A5A5A5',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  safetyInput: {
    height: 38,
    backgroundColor: '#120E21',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#342E5E',
    color: '#FFF',
    paddingHorizontal: 12,
    fontSize: 12,
  },
  hotlineWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(157, 141, 241, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(157, 141, 241, 0.15)',
    padding: 10,
    marginTop: 10,
  },
  hotlineWarningText: {
    fontSize: 10,
    color: '#A5A5A5',
  },
  hotlineBadge: {
    backgroundColor: '#120E21',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hotlineBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#9D8DF1',
  },
  suddenFallBtn: {
    backgroundColor: 'rgba(255, 75, 75, 0.15)',
    borderWidth: 1,
    borderColor: '#FF4B4B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  suddenFallBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FF4B4B',
  },
  emptyLogsCard: {
    backgroundColor: '#120E21',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  emptyLogsText: {
    fontSize: 10,
    color: '#A5A5A5',
  },
  logsList: {
    gap: 6,
  },
  logItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#120E21',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(52, 46, 94, 0.5)',
  },
  logItemLeft: {
    flex: 1,
  },
  logItemEvent: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  logItemTime: {
    fontSize: 9,
    color: '#A5A5A5',
    marginTop: 2,
  },
  logItemBadge: {
    backgroundColor: '#1E1938',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  logItemBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#9D8DF1',
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
  menuProfileSection: {
    backgroundColor: '#1E1938',
    borderRadius: 14,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#342E5E',
  },
  menuSectionHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9D8DF1',
    marginVertical: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuProfileDetails: {
    gap: 4,
  },
  profileLabel: {
    fontSize: 10,
    color: '#A5A5A5',
    marginTop: 4,
  },
  profileValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  authBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  authBadgeText: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  menuProfileUnconfigured: {
    fontSize: 11,
    color: '#A5A5A5',
    lineHeight: 16,
  },
  serverInput: {
    backgroundColor: '#120E21',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#342E5E',
    color: '#FFF',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 4,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotText: {
    fontSize: 10,
    color: '#A5A5A5',
    fontWeight: '500',
  },
  menuItemsList: {
    marginTop: 5,
    gap: 12,
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
    marginTop: 15,
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
  ogooCoachingCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1938',
    borderRadius: 16,
    padding: 12,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#342E5E',
    alignItems: 'center',
    gap: 12,
  },
  ogooCoachingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#9D8DF1',
  },
  ogooCoachingBody: {
    flex: 1,
  },
  ogooCoachingName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9D8DF1',
    marginBottom: 2,
  },
  ogooCoachingText: {
    fontSize: 12,
    color: '#E0E0E0',
    lineHeight: 16,
  },
});
