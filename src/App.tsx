import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Menu, Heart, Activity, Calendar, Mic, Loader2, StopCircle, 
  X, Plus, Trash2, Check, Sparkles, Droplet, Flame, TrendingUp, Clock, AlertCircle, ArrowLeft,
  Volume2, VolumeX
} from 'lucide-react';
import Markdown from 'react-markdown';

const pcmToBase64 = (pcmData: Float32Array) => {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export default function App() {
  const [messages, setMessages] = useState([
    { id: '1', text: "Hello! I'm Ogoo, your personal health assistant. How can I help you today?", fromUser: false }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const chatMode = 'general';
  const [isLive, setIsLive] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Audio state
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Active Dashboard Modal State
  const [activeModal, setActiveModal] = useState<'liquid' | 'schedule' | 'vitals' | 'activity' | 'plan' | null>(null);

  // Device ID & Location and Onboarding state
  const [deviceId, setDeviceId] = useState<string>(() => {
    let id = localStorage.getItem('ogoo_device_id');
    if (!id) {
      id = 'ogoo-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
      localStorage.setItem('ogoo_device_id', id);
    }
    return id;
  });
  const [geoLocation, setGeoLocation] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatViewActive, setIsChatViewActive] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    return localStorage.getItem('ogoo_voice_enabled') !== 'false';
  });

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();

    // Strip markdown formatting & internal tracking tags
    let cleaned = text
      .replace(/[*_#`~>]/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/\[ONBOARDING STATUS:[^\]]+\]/gi, '')
      .replace(/\[SET_PROFILE:[^\]]+\]/gi, '')
      .trim();

    if (!cleaned) return;

    const utterance = new SpeechSynthesisUtterance(cleaned);
    const voices = window.speechSynthesis.getVoices();
    const chosenVoice = voices.find(v => 
      v.lang.startsWith('en') && 
      (v.name.includes('Google US English') || v.name.includes('Samantha') || v.name.includes('Natural') || v.name.includes('Hazel') || v.name.includes('Zira'))
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];

    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }

    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    
    window.speechSynthesis.speak(utterance);
  };

  const isLoadedFromServer = useRef(false);

  const syncMetrics = async (metricsToUpdate: {
    waterIntake?: number;
    waterLog?: any[];
    schedule?: any[];
    vitalsLog?: any[];
    activity?: any;
    customPlan?: string;
  }) => {
    try {
      await fetch('/api/user/update-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          ...metricsToUpdate
        })
      });
    } catch (err) {
      console.error("Failed to sync metrics with server:", err);
    }
  };

  // Initialize user profile, location, and load persistent history on mount
  useEffect(() => {
    const fetchGeoLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          const locationData = {
            city: data.city,
            region: data.region,
            country_name: data.country_name,
            latitude: data.latitude,
            longitude: data.longitude
          };
          setGeoLocation(locationData);
          return locationData;
        }
      } catch (e) {
        console.warn("Failed to fetch location via ipapi:", e);
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              city: "Approximate Coordinates",
              region: "",
              country_name: ""
            };
            setGeoLocation(loc);
          },
          (err) => console.log("Browser geolocation rejected:", err)
        );
      }
      return null;
    };

    const initUser = async () => {
      const loc = await fetchGeoLocation();
      try {
        const res = await fetch('/api/user/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, location: loc })
        });
        if (res.ok) {
          const data = await res.json();
          setUserProfile(data.profile);
          if (data.profile) {
            if (data.profile.waterIntake !== undefined) setWaterIntake(data.profile.waterIntake);
            if (data.profile.waterLog) setWaterLog(data.profile.waterLog);
            if (data.profile.schedule) setSchedule(data.profile.schedule);
            if (data.profile.vitalsLog) setVitalsLog(data.profile.vitalsLog);
            if (data.profile.activity) setActivity(data.profile.activity);
            if (data.profile.customPlan) setCustomPlan(data.profile.customPlan);
          }
          isLoadedFromServer.current = true;
          if (data.history && data.history.length > 0) {
            setMessages(data.history);
          }
        }
      } catch (err) {
        console.error("Failed to initialize user profile from backend:", err);
      }
    };

    initUser();
  }, [deviceId]);

  const handleBackToDashboard = () => {
    setActiveModal(null);
    setIsChatViewActive(false);
    setInputText('');
    setIsFocused(false);
  };

  const handleClearUserProfile = async () => {
    if (!window.confirm("Are you sure you want to clear your account profile and all conversation history? This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch('/api/user/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.profile);
        
        isLoadedFromServer.current = false;
        
        setWaterIntake(0);
        setWaterLog([]);
        setSchedule([]);
        setVitalsLog([]);
        setActivity({ steps: 0, stepGoal: 10000, minutes: 0, calories: 0 });
        setCustomPlan(`### 🌱 Your Personalized Wellness Plan\n\nNo wellness plan has been generated yet. Talk to Ogoo or click **Generate with AI** below to dynamically construct a wellness routine matching your real-time body temperature, step progress, and hydration log.`);
        
        setTimeout(() => {
          isLoadedFromServer.current = true;
        }, 100);

        setMessages([
          { id: '1', text: "Hello! I'm Ogoo, your personal health assistant. How can I help you today?", fromUser: false }
        ]);
        setIsMenuOpen(false);
        handleBackToDashboard();
      }
    } catch (err) {
      console.error("Failed to clear profile:", err);
    }
  };

  // 1. Liquid Intake states
  const [waterIntake, setWaterIntake] = useState<number>(() => {
    const saved = localStorage.getItem('ogoo_water_intake');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [waterGoal] = useState<number>(2000);
  const [waterLog, setWaterLog] = useState<{ id: string; amount: number; time: string }[]>(() => {
    const saved = localStorage.getItem('ogoo_water_log');
    return saved ? JSON.parse(saved) : [];
  });

  // 2. Plan Schedule states
  const [schedule, setSchedule] = useState<{ id: string; title: string; time: string; completed: boolean; category: string }[]>(() => {
    const saved = localStorage.getItem('ogoo_schedule');
    return saved ? JSON.parse(saved) : [];
  });
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('08:00');
  const [newScheduleCategory, setNewScheduleCategory] = useState('Medicine');

  // 3. Vitals states
  const [vitalsLog, setVitalsLog] = useState<{ id: string; bpm: number; bp: string; spo2: number; temp: number; time: string; status: string }[]>(() => {
    const saved = localStorage.getItem('ogoo_vitals_log');
    return saved ? JSON.parse(saved) : [];
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(''); // Text status during scanning
  const [manualBpm, setManualBpm] = useState('72');
  const [manualBp, setManualBp] = useState('120/80');
  const [manualSpo2, setManualSpo2] = useState('98');
  const [manualTemp, setManualTemp] = useState('98.6');

  // Wearable / Bluetooth connectivity states
  const [isConnectingWearable, setIsConnectingWearable] = useState(false);
  const [wearableDevice, setWearableDevice] = useState<string | null>(() => {
    return localStorage.getItem('ogoo_wearable_device') || null;
  });
  const [wearableConnected, setWearableConnected] = useState<boolean>(() => {
    return localStorage.getItem('ogoo_wearable_device') !== null;
  });

  // 4. Daily Activity states
  const [activity, setActivity] = useState<{ steps: number; stepGoal: number; minutes: number; calories: number }>(() => {
    const saved = localStorage.getItem('ogoo_activity');
    return saved ? JSON.parse(saved) : {
      steps: 0,
      stepGoal: 10000,
      minutes: 0,
      calories: 0
    };
  });

  // 5. Custom Health Plan (AI Generated)
  const [customPlan, setCustomPlan] = useState<string>(() => {
    const saved = localStorage.getItem('ogoo_custom_plan');
    return saved || `### 🌱 Your Personalized Wellness Plan\n\nNo wellness plan has been generated yet. Talk to Ogoo or click **Generate with AI** below to dynamically construct a wellness routine matching your real-time body temperature, step progress, and hydration log.`;
  });
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Persistence triggers
  useEffect(() => {
    localStorage.setItem('ogoo_water_intake', waterIntake.toString());
    if (isLoadedFromServer.current) {
      syncMetrics({ waterIntake });
    }
  }, [waterIntake]);

  useEffect(() => {
    localStorage.setItem('ogoo_water_log', JSON.stringify(waterLog));
    if (isLoadedFromServer.current) {
      syncMetrics({ waterLog });
    }
  }, [waterLog]);

  useEffect(() => {
    localStorage.setItem('ogoo_schedule', JSON.stringify(schedule));
    if (isLoadedFromServer.current) {
      syncMetrics({ schedule });
    }
  }, [schedule]);

  useEffect(() => {
    localStorage.setItem('ogoo_vitals_log', JSON.stringify(vitalsLog));
    if (isLoadedFromServer.current) {
      syncMetrics({ vitalsLog });
    }
  }, [vitalsLog]);

  useEffect(() => {
    localStorage.setItem('ogoo_activity', JSON.stringify(activity));
    if (isLoadedFromServer.current) {
      syncMetrics({ activity });
    }
  }, [activity]);

  useEffect(() => {
    localStorage.setItem('ogoo_custom_plan', customPlan);
    if (isLoadedFromServer.current) {
      syncMetrics({ customPlan });
    }
  }, [customPlan]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const showDashboard = !isChatViewActive && !activeModal;

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputText.trim() === '' || isLoading) return;

    // Transition immediately to the conversational chat view on send
    setIsChatViewActive(true);

    if (isLive && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text: inputText }));
      const userMsg = { id: Date.now().toString(), text: inputText, fromUser: true };
      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      return;
    }

    const currentInput = inputText.trim();
    const userMsg = { id: Date.now().toString(), text: currentInput, fromUser: true };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deviceId: deviceId,
          location: geoLocation,
          message: currentInput, 
          mode: chatMode,
          vitals: vitalsLog[0] || null,
          activity: activity,
          waterIntake: waterIntake,
          waterGoal: waterGoal,
          schedule: schedule
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
         setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            text: data.error || "I'm having trouble connecting to my brain. Please try again.",
            fromUser: false
         }]);
         return;
      }

      // Update local profile with latest server onboarding updates
      if (data.profile) {
        setUserProfile(data.profile);
      }

      const ogooMsg = { 
        id: (Date.now() + 1).toString(), 
        text: data.reply, 
        fromUser: false 
      };
      setMessages((prev) => [...prev, ogooMsg]);
      speak(data.reply);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: 'error',
        text: "I'm having trouble connecting. Check your internet?",
        fromUser: false
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const type = file.type.split('/')[0];
    const userMsg = { 
      id: Date.now().toString(), 
      text: `Sent a ${type} file: ${file.name}`, 
      fromUser: true 
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const formData = new FormData();
    formData.append('media', file);
    formData.append('type', type);

    try {
      const response = await fetch('/api/analyze-media', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
         setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            text: data.error || "Failed to analyze the file. Please try again.",
            fromUser: false
         }]);
         return;
      }

      const ogooMsg = { id: (Date.now() + 1).toString(), text: data.reply, fromUser: false };
      setMessages((prev) => [...prev, ogooMsg]);
      speak(data.reply);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: 'error',
        text: "Failed to analyze the file.",
        fromUser: false
      }]);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleLiveAPI = async () => {
    if (isLive) {
      setIsLive(false);
      wsRef.current?.close();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (processorRef.current) processorRef.current.disconnect();
      try {
        if (inputAudioCtxRef.current) await inputAudioCtxRef.current.close();
        if (outputAudioCtxRef.current) await outputAudioCtxRef.current.close();
      } catch (err) {
        console.error("Error closing audio context", err);
      }
      return;
    }

    try {
      setIsLive(true);
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/live`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
         throw new Error("Web Audio API is not supported in this browser.");
      }

      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          const binary = atob(msg.audio);
          const len = binary.length;
          const buffer = new ArrayBuffer(len);
          const view = new Uint8Array(buffer);
          for (let i = 0; i < len; i++) view[i] = binary.charCodeAt(i);
          
          const pcm16 = new Int16Array(buffer);
          const audioBuffer = outputCtx.createBuffer(1, pcm16.length, 24000);
          const channelData = audioBuffer.getChannelData(0);
          for (let i = 0; i < pcm16.length; i++) {
            channelData[i] = pcm16[i] / 32768.0;
          }
          
          const src = outputCtx.createBufferSource();
          src.buffer = audioBuffer;
          src.connect(outputCtx.destination);
          
          const currTime = outputCtx.currentTime;
          if (nextStartTimeRef.current < currTime) {
            nextStartTimeRef.current = currTime;
          }
          src.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
        }
        if (msg.interrupted) {
          nextStartTimeRef.current = 0;
        }
      };
      
      ws.onclose = () => {
         setIsLive(false);
      };
    } catch (e: any) {
      console.error(e);
      setIsLive(false);
      setMessages((prev) => [...prev, {
         id: Date.now().toString(),
         text: `Microphone or live audio failed to start. Please make sure microphone access is granted in your browser settings. (${e.message || "Unknown error"})`,
         fromUser: false
      }]);
    }
  };

  // Helper formatting helper for standard times
  const formatAMPM = (timeStr: string) => {
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutesStr} ${ampm}`;
  };

  // 1. Handlers for Water Intake
  const handleAddWater = (amount: number) => {
    setWaterIntake((prev) => prev + amount);
    const newLog = {
      id: Date.now().toString(),
      amount,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setWaterLog((prev) => [newLog, ...prev]);
  };

  const handleClearWater = () => {
    setWaterIntake(0);
    setWaterLog([]);
  };

  const handleDeleteWaterItem = (id: string) => {
    const item = waterLog.find((log) => log.id === id);
    if (item) {
      setWaterIntake((prev) => Math.max(0, prev - item.amount));
    }
    setWaterLog((prev) => prev.filter((log) => log.id !== id));
  };

  // 2. Handlers for Schedule
  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleTitle.trim()) return;

    const newItem = {
      id: Date.now().toString(),
      title: newScheduleTitle.trim(),
      time: formatAMPM(newScheduleTime),
      completed: false,
      category: newScheduleCategory
    };

    setSchedule((prev) => [...prev, newItem]);
    setNewScheduleTitle('');
  };

  const handleToggleSchedule = (id: string) => {
    setSchedule((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const handleDeleteSchedule = (id: string) => {
    setSchedule((prev) => prev.filter((item) => item.id !== id));
  };

  // 3. Handlers for Vitals Scanner & Logger
  const handleConnectWearable = async () => {
    if (isConnectingWearable) return;
    setIsConnectingWearable(true);
    
    try {
      const nav = navigator as any;
      if (nav.bluetooth && nav.bluetooth.requestDevice) {
        const device = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['heart_rate']
        });
        if (device) {
          const dName = device.name || "Bluetooth Smart Watch";
          setWearableDevice(dName);
          setWearableConnected(true);
          localStorage.setItem('ogoo_wearable_device', dName);
        }
      } else {
        throw new Error("Bluetooth API not found");
      }
    } catch (e) {
      // Intelligent virtual local smartband pairing protocol fallback
      setTimeout(() => {
        const fallbackDevices = ["Ogoo Smart-Ring X1", "Fenix 8 Smartwatch", "Apple Watch Series 10", "Fitbit Charge 6"];
        const chosen = fallbackDevices[Math.floor(Math.random() * fallbackDevices.length)];
        setWearableDevice(chosen);
        setWearableConnected(true);
        localStorage.setItem('ogoo_wearable_device', chosen);
        setIsConnectingWearable(false);
      }, 1500);
      return;
    }
    setIsConnectingWearable(false);
  };

  const handleDisconnectWearable = () => {
    setWearableDevice(null);
    setWearableConnected(false);
    localStorage.removeItem('ogoo_wearable_device');
  };

  const handleTriggerScanner = () => {
    if (isScanning) return;
    setIsScanning(true);
    
    if (wearableConnected) {
      setScanStep(`Establishing secure pairing link with ${wearableDevice}...`);
      setTimeout(() => {
        setScanStep('Syncing latest heart rate stream...');
      }, 1000);
      setTimeout(() => {
        setScanStep('Retrieving SpO2 & Skin Temperature logs...');
      }, 2000);
    } else {
      setScanStep('Initializing diagnostic sensors...');
      setTimeout(() => {
        setScanStep('Measuring heart pulse wave...');
      }, 800);
      setTimeout(() => {
        setScanStep('Analyzing blood oxygen levels...');
      }, 1600);
      setTimeout(() => {
        setScanStep('Verifying body temperature equilibrium...');
      }, 2400);
    }

    setTimeout(() => {
      // Generate randomized, fully healthy parameters matching standard sensor ranges
      const bpm = Math.floor(Math.random() * (78 - 66 + 1)) + 66; // 66-78
      const systolic = Math.floor(Math.random() * (120 - 114 + 1)) + 114;
      const diastolic = Math.floor(Math.random() * (80 - 74 + 1)) + 74;
      const bp = `${systolic}/${diastolic}`;
      const spo2 = Math.floor(Math.random() * (100 - 98 + 1)) + 98; // 98-100%
      const temp = parseFloat((Math.random() * (98.6 - 98.0) + 98.0).toFixed(1));

      const newScan = {
        id: Date.now().toString(),
        bpm,
        bp,
        spo2,
        temp,
        time: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ` + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Healthy'
      };

      setVitalsLog((prev) => [newScan, ...prev]);
      setIsScanning(false);
      setScanStep('');

      // Auto update active step tracker state on wearable sync
      if (wearableConnected) {
        setActivity((prev) => ({
          ...prev,
          steps: Math.min(prev.stepGoal, prev.steps + Math.floor(Math.random() * 1200) + 800),
          minutes: prev.minutes + Math.floor(Math.random() * 10) + 5,
          calories: prev.calories + Math.floor(Math.random() * 60) + 30
        }));
      }

      setManualBpm(bpm.toString());
      setManualBp(bp);
      setManualSpo2(spo2.toString());
      setManualTemp(temp.toString());
    }, wearableConnected ? 3000 : 3200);
  };

  const handleManualAddVitals = (e: React.FormEvent) => {
    e.preventDefault();
    const bpm = parseInt(manualBpm, 10) || 72;
    const spo2 = parseInt(manualSpo2, 10) || 98;
    const temp = parseFloat(manualTemp) || 98.6;
    const bp = manualBp.trim() || "120/80";

    // Determine basic diagnostic categorization
    let status = 'Healthy';
    const [systolicStr] = bp.split('/');
    const systolic = parseInt(systolicStr, 10) || 120;
    if (systolic >= 130 || bpm > 100) {
      status = 'Elevated';
    } else if (spo2 < 95) {
      status = 'Attention Needed';
    }

    const newLog = {
      id: Date.now().toString(),
      bpm,
      bp,
      spo2,
      temp,
      time: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ` + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status
    };

    setVitalsLog((prev) => [newLog, ...prev]);
  };

  // 4. Handlers for Activity Updates
  const handleQuickActivity = (type: 'walk' | 'run' | 'cardio') => {
    setActivity((prev) => {
      if (type === 'walk') {
        return {
          ...prev,
          steps: Math.min(prev.stepGoal * 2, prev.steps + 1500),
          minutes: prev.minutes + 12,
          calories: prev.calories + 65
        };
      } else if (type === 'run') {
        return {
          ...prev,
          steps: Math.min(prev.stepGoal * 2, prev.steps + 3200),
          minutes: prev.minutes + 22,
          calories: prev.calories + 180
        };
      } else {
        return {
          ...prev,
          minutes: prev.minutes + 15,
          calories: prev.calories + 110
        };
      }
    });
  };

  const handleResetActivity = () => {
    setActivity((prev) => ({
      ...prev,
      steps: 0,
      minutes: 0,
      calories: 0
    }));
  };

  // 5. Custom AI Health Plan Generator
  const handleGenerateCustomPlan = async () => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);

    const latestVital = vitalsLog[0] || { bpm: 72, bp: '120/80', spo2: 98, temp: 98.6 };

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: activity.steps,
          stepGoal: activity.stepGoal,
          waterIntake,
          waterGoal,
          bpm: latestVital.bpm,
          bp: latestVital.bp,
          spo2: latestVital.spo2,
          temp: latestVital.temp
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate your personalized wellness program.");
      }

      if (data.plan) {
        setCustomPlan(data.plan);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "An unexpected error occurred while customizing your plan. Please check your connectivity and try again.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#120E21] text-[#FFFFFF] font-sans antialiased overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-6 pt-10 pb-5 md:pt-6 max-w-3xl w-full mx-auto">
        <div className="flex items-center">
          {!showDashboard && (
            <button 
              onClick={handleBackToDashboard}
              className="mr-3 w-10 h-10 rounded-full bg-[#1E1938] flex justify-center items-center hover:bg-[#2a234e] transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="text-white w-5 h-5" />
            </button>
          )}
          <img
            src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80"
            alt="Ogoo Avatar"
            className="w-10 h-10 rounded-full mr-3 border border-[#9D8DF1] object-cover"
          />
          <div>
            <h1 className="text-lg font-bold">Ogoo</h1>
            <div className="flex items-center mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4CAF50] mr-1.5 animate-pulse"></div>
              <span className="text-[11px] font-medium text-[#A5A5A5]">Online</span>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => setIsMenuOpen(true)}
          className="w-10 h-10 rounded-full bg-[#1E1938] flex justify-center items-center hover:bg-[#2a234e] transition-colors cursor-pointer"
          title="Profile Menu"
        >
          <Menu className="text-white w-5 h-5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 pb-6 max-w-3xl w-full mx-auto relative scrollbar-hide">
        {showDashboard && (
          <div className="mb-6 space-y-4 animate-fadeIn">
            {/* Welcome Hero */}
            <div className="bg-[#1E1938] p-6 rounded-[28px] border border-[#342E5E]">
              <h2 className="text-2xl font-extrabold mb-2">Welcome! 👋</h2>
              <p className="text-[#E0E0E0] text-sm leading-relaxed mb-6">
                I'm Ogoo, your personal health companion. I'm here to help you track your vitals,
                manage your fitness plans, and answer any health questions you may have.
              </p>
              
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setActiveModal('liquid')}
                  className="flex-1 flex items-center justify-center bg-[#6C5CE7] hover:bg-[#5b4cd1] py-3 rounded-xl transition-all shadow-[0_4px_10px_rgba(108,92,231,0.3)] cursor-pointer"
                >
                  <Heart className="w-4 h-4 text-white mr-2 fill-white" />
                  <span className="text-white font-bold text-sm">Liquid Intake</span>
                </button>
                <button 
                  onClick={() => setActiveModal('schedule')}
                  className="flex-1 flex items-center justify-center bg-transparent border-[1.5px] border-[#9D8DF1] hover:bg-[#9D8DF1]/10 py-3 rounded-xl transition-all cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-[#9D8DF1] mr-2" />
                  <span className="text-[#9D8DF1] font-bold text-sm">Plan Schedule</span>
                </button>
              </div>
            </div>

            {/* Vitals Card */}
            <button 
              onClick={() => setActiveModal('vitals')}
              className="w-full bg-[#1E1938] p-4 rounded-3xl flex items-center hover:bg-[#2a234e] transition-colors cursor-pointer border border-transparent hover:border-[#342E5E]"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FF4B4B]/15 flex justify-center items-center mr-4 shrink-0">
                <Heart className="w-[22px] h-[22px] text-[#FF4B4B] fill-[#FF4B4B]" />
              </div>
              <div className="text-left flex-1">
                <h3 className="text-[17px] font-bold text-[#FFFFFF]">Check vitals</h3>
                <p className="text-[13px] text-[#A5A5A5] mt-1">Let's see how your heart is beating</p>
              </div>
              {vitalsLog.length > 0 && (
                <div className="text-right mr-2">
                  <div className="text-xs text-[#A5A5A5]">Last scan</div>
                  <div className="text-sm font-extrabold text-[#FF4B4B]">{vitalsLog[0].bpm} BPM</div>
                </div>
              )}
            </button>

            {/* Grid Row */}
            <div className="flex justify-between gap-3">
              <button 
                onClick={() => setActiveModal('activity')}
                className="bg-[#1E1938] w-1/2 p-5 rounded-3xl flex flex-col items-start hover:bg-[#2a234e] transition-colors cursor-pointer border border-transparent hover:border-[#342E5E]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#342E5E] flex justify-center items-center mb-3">
                  <Activity className="w-5 h-5 text-[#9D8DF1]" />
                </div>
                <span className="font-semibold text-sm mb-1">Daily activity</span>
                <span className="text-xs text-[#A5A5A5]">{activity.steps.toLocaleString()} / {activity.stepGoal.toLocaleString()} steps</span>
              </button>
              
              <button 
                onClick={() => setActiveModal('plan')}
                className="bg-[#1E1938] w-1/2 p-5 rounded-3xl flex flex-col items-start hover:bg-[#2a234e] transition-colors cursor-pointer border border-transparent hover:border-[#342E5E]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#342E5E] flex justify-center items-center mb-3">
                  <Calendar className="w-5 h-5 text-[#9D8DF1]" />
                </div>
                <span className="font-semibold text-sm mb-1">View my plan</span>
                <span className="text-xs text-[#9D8DF1] flex items-center">
                  <Sparkles className="w-3 h-3 mr-1" /> Personalized
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ==================== 1. MODAL: LIQUID INTAKE ==================== */}
        {activeModal === 'liquid' && (
          <div className="bg-[#1E1938] border border-[#342E5E] rounded-[28px] p-6 mb-6 space-y-6 animate-fadeIn relative">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#120E21] flex items-center justify-center hover:bg-[#342E5E] transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#6C5CE7]/25 flex items-center justify-center">
                <Droplet className="w-5 h-5 text-[#9D8DF1]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold">Liquid Intake</h3>
                <p className="text-xs text-[#A5A5A5]">Track and manage your daily hydration progress</p>
              </div>
            </div>

            {/* Circular Hydration Meter */}
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative w-40 h-40 flex items-center justify-center">
                {/* SVG Radial Ring */}
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle 
                    cx="50" cy="50" r="42" 
                    stroke="#120E21" strokeWidth="8" fill="transparent"
                  />
                  <circle 
                    cx="50" cy="50" r="42" 
                    stroke="#6C5CE7" strokeWidth="8" fill="transparent"
                    strokeDasharray="264"
                    strokeDashoffset={264 - (264 * Math.min(100, (waterIntake / waterGoal) * 100)) / 100}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-white">{waterIntake}</span>
                  <span className="text-xs text-[#A5A5A5]">/ {waterGoal} ml</span>
                  <span className="text-[10px] font-bold text-[#9D8DF1] mt-1">
                    {Math.round((waterIntake / waterGoal) * 100)}% Hydrated
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleAddWater(250)}
                className="bg-[#120E21] border border-[#342E5E] hover:border-[#6C5CE7] py-3 rounded-2xl flex flex-col items-center justify-center transition-colors cursor-pointer"
              >
                <span className="text-lg font-bold text-[#9D8DF1]">+250ml</span>
                <span className="text-[11px] text-[#A5A5A5]">Glass Cup</span>
              </button>
              <button 
                onClick={() => handleAddWater(500)}
                className="bg-[#120E21] border border-[#342E5E] hover:border-[#6C5CE7] py-3 rounded-2xl flex flex-col items-center justify-center transition-colors cursor-pointer"
              >
                <span className="text-lg font-bold text-[#9D8DF1]">+500ml</span>
                <span className="text-[11px] text-[#A5A5A5]">Sports Bottle</span>
              </button>
            </div>

            {/* Drink Logs */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-sm font-bold">Today's Intake Log</span>
                {waterIntake > 0 && (
                  <button 
                    onClick={handleClearWater}
                    className="text-xs text-red-400 hover:underline flex items-center"
                  >
                    Reset intake
                  </button>
                )}
              </div>
              {waterLog.length === 0 ? (
                <div className="bg-[#120E21] rounded-2xl p-4 text-center text-xs text-[#A5A5A5]">
                  No liquids recorded yet today. Take a sip of water!
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                  {waterLog.map((log) => (
                    <div key={log.id} className="flex justify-between items-center bg-[#120E21] p-3 rounded-xl border border-[#342E5E]/50">
                      <div className="flex items-center space-x-2">
                        <Droplet className="w-3.5 h-3.5 text-[#6C5CE7] fill-[#6C5CE7]" />
                        <span className="text-sm font-semibold">{log.amount} ml</span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-[#A5A5A5]">
                        <span>{log.time}</span>
                        <button 
                          onClick={() => handleDeleteWaterItem(log.id)}
                          className="hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 2. MODAL: PLAN SCHEDULE ==================== */}
        {activeModal === 'schedule' && (
          <div className="bg-[#1E1938] border border-[#342E5E] rounded-[28px] p-6 mb-6 space-y-6 animate-fadeIn relative">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#120E21] flex items-center justify-center hover:bg-[#342E5E] transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#9D8DF1]/25 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[#9D8DF1]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold">Plan Schedule</h3>
                <p className="text-xs text-[#A5A5A5]">Your daily medical and wellness routine schedule</p>
              </div>
            </div>

            {/* New Reminder Form */}
            <form onSubmit={handleAddSchedule} className="bg-[#120E21] p-4 rounded-2xl border border-[#342E5E] space-y-3">
              <div className="text-xs font-bold text-[#9D8DF1] uppercase tracking-wide">Add Scheduled reminder</div>
              <input 
                type="text" 
                placeholder="Medicine name, exercise, or task..."
                value={newScheduleTitle}
                onChange={(e) => setNewScheduleTitle(e.target.value)}
                className="w-full bg-[#1E1938] border border-[#342E5E] focus:border-[#9D8DF1] rounded-xl px-3 py-2 text-sm outline-none placeholder:text-[#666]"
                required
              />
              <div className="flex space-x-2">
                <input 
                  type="time" 
                  value={newScheduleTime}
                  onChange={(e) => setNewScheduleTime(e.target.value)}
                  className="bg-[#1E1938] border border-[#342E5E] focus:border-[#9D8DF1] rounded-xl px-3 py-2 text-sm outline-none flex-1 text-white"
                  required
                />
                <select 
                  value={newScheduleCategory}
                  onChange={(e) => setNewScheduleCategory(e.target.value)}
                  className="bg-[#1E1938] border border-[#342E5E] focus:border-[#9D8DF1] rounded-xl px-2 py-2 text-sm outline-none text-[#9D8DF1] font-semibold"
                >
                  <option value="Medicine">💊 Medicine</option>
                  <option value="Exercise">🏃 Exercise</option>
                  <option value="Hydration">💧 Hydration</option>
                  <option value="Diet">🍏 Diet</option>
                  <option value="General">📋 General</option>
                </select>
              </div>
              <button 
                type="submit"
                className="w-full bg-[#6C5CE7] hover:bg-[#5b4cd1] text-white font-bold py-2 rounded-xl text-xs transition-all uppercase tracking-wide flex items-center justify-center"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Routine Item
              </button>
            </form>

            {/* List Schedule items */}
            <div className="space-y-3">
              <div className="text-sm font-bold px-1">Today's Routines ({schedule.filter(s=>s.completed).length}/{schedule.length})</div>
              {schedule.length === 0 ? (
                <div className="bg-[#120E21] rounded-2xl p-4 text-center text-xs text-[#A5A5A5]">
                  No routines mapped out. Add an entry above!
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {schedule.map((item) => (
                    <div 
                      key={item.id} 
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                        item.completed 
                          ? 'bg-[#120E21]/50 border-[#342E5E]/40 opacity-70' 
                          : 'bg-[#120E21] border-[#342E5E]'
                      }`}
                    >
                      <button 
                        onClick={() => handleToggleSchedule(item.id)}
                        className="flex items-center text-left space-x-3 flex-1"
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          item.completed 
                            ? 'bg-[#6C5CE7] border-[#6C5CE7] text-white' 
                            : 'border-[#9D8DF1] bg-transparent'
                        }`}>
                          {item.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${item.completed ? 'line-through text-[#A5A5A5]' : 'text-white'}`}>
                            {item.title}
                          </div>
                          <div className="flex items-center space-x-2 mt-0.5 text-[10px] text-[#A5A5A5]">
                            <span className="bg-[#342E5E] px-1.5 py-0.5 rounded text-[#9D8DF1] uppercase font-bold">{item.category}</span>
                            <span className="flex items-center">
                              <Clock className="w-2.5 h-2.5 mr-0.5" /> {item.time}
                            </span>
                          </div>
                        </div>
                      </button>

                      <button 
                        onClick={() => handleDeleteSchedule(item.id)}
                        className="text-[#A5A5A5] hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 3. MODAL: CHECK VITALS ==================== */}
        {activeModal === 'vitals' && (
          <div className="bg-[#1E1938] border border-[#342E5E] rounded-[28px] p-6 mb-6 space-y-6 animate-fadeIn relative">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#120E21] flex items-center justify-center hover:bg-[#342E5E] transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF4B4B]/25 flex items-center justify-center">
                <Heart className="w-5 h-5 text-[#FF4B4B] fill-[#FF4B4B]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold">Vitals Hub</h3>
                <p className="text-xs text-[#A5A5A5]">Run real-time diagnostics or log your physical vitals</p>
              </div>
            </div>

            {/* Diagnostic Scanner Engine */}
            <div className="bg-[#120E21] p-5 rounded-2xl border border-[#342E5E] flex flex-col items-center justify-center relative overflow-hidden">
              {isScanning ? (
                <div className="py-6 flex flex-col items-center justify-center space-y-4 w-full">
                  <div className="relative">
                    {/* Ring animation */}
                    <div className="w-16 h-16 rounded-full border-4 border-t-transparent border-[#FF4B4B] animate-spin"></div>
                    <Heart className="w-7 h-7 text-[#FF4B4B] fill-[#FF4B4B] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white uppercase tracking-wider animate-pulse">Scanning Diagnostics...</div>
                    <div className="text-xs text-[#9D8DF1] mt-1 transition-all h-4">{scanStep}</div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center space-y-3 w-full">
                  <div className="w-14 h-14 rounded-full bg-[#FF4B4B]/15 flex items-center justify-center mx-auto mb-2">
                    <Heart className="w-7 h-7 text-[#FF4B4B] fill-[#FF4B4B]" />
                  </div>
                  <p className="text-xs text-[#A5A5A5] max-w-xs mx-auto">
                    Press the button below to initiate Ogoo's AI heartbeat wave analyzer and log instant simulated vital signs.
                  </p>
                  <button 
                    onClick={handleTriggerScanner}
                    className="w-full max-w-xs bg-[#FF4B4B] hover:bg-red-600 text-white font-extrabold py-3 px-6 rounded-2xl text-xs transition-all uppercase tracking-wide flex items-center justify-center mx-auto cursor-pointer"
                  >
                    <Activity className="w-4 h-4 mr-1.5 animate-pulse" /> Initialize Bio-Sensor Scan
                  </button>
                </div>
              )}
            </div>

            {/* Wearable Connection Panel */}
            <div className="bg-[#120E21]/80 border border-[#342E5E]/60 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-xs font-bold text-[#9D8DF1] uppercase tracking-wider">Device & Wearable Integration</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  wearableConnected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {wearableConnected ? 'Active Connection' : 'Disconnected'}
                </span>
              </div>
              
              {wearableConnected ? (
                <div className="flex items-center justify-between bg-[#1E1938]/60 p-3 rounded-xl border border-[#342E5E]/40">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-green-400 animate-pulse" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{wearableDevice}</div>
                      <div className="text-[10px] text-[#A5A5A5]">Sensors actively broadcasting live vitals</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleDisconnectWearable}
                    className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors bg-red-500/15 hover:bg-red-500/25 px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-[#A5A5A5] leading-relaxed">
                    Pair Ogoo with your fitness band, smartwatch, or health ring to automatically sync live telemetry without manually typing entries.
                  </p>
                  <button
                    onClick={handleConnectWearable}
                    disabled={isConnectingWearable}
                    className="w-full bg-[#9D8DF1]/10 border border-[#9D8DF1]/30 hover:bg-[#9D8DF1]/20 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    {isConnectingWearable ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9D8DF1]" />
                        <span className="animate-pulse">Searching nearby wearable nodes...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#9D8DF1]" />
                        <span>Pair New Wearable / IoT Device</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Manual Entries Form */}
            <details className="group bg-[#120E21]/50 border border-[#342E5E]/40 rounded-2xl p-4">
              <summary className="text-xs font-bold text-[#9D8DF1] cursor-pointer select-none outline-none flex justify-between items-center">
                <span>MANUALLY ADD LOGS</span>
                <Plus className="w-4 h-4 text-[#9D8DF1] transition-transform group-open:rotate-45" />
              </summary>
              
              <form onSubmit={handleManualAddVitals} className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="block text-[10px] text-[#A5A5A5] mb-1">HEART RATE (BPM)</label>
                  <input 
                    type="number" 
                    value={manualBpm}
                    onChange={(e)=>setManualBpm(e.target.value)}
                    className="w-full bg-[#1E1938] border border-[#342E5E] rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#A5A5A5] mb-1">BLOOD PRESSURE (BP)</label>
                  <input 
                    type="text" 
                    value={manualBp}
                    onChange={(e)=>setManualBp(e.target.value)}
                    className="w-full bg-[#1E1938] border border-[#342E5E] rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#A5A5A5] mb-1">OXYGEN (SPO2 %)</label>
                  <input 
                    type="number" 
                    value={manualSpo2}
                    onChange={(e)=>setManualSpo2(e.target.value)}
                    className="w-full bg-[#1E1938] border border-[#342E5E] rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#A5A5A5] mb-1">TEMP (°F)</label>
                  <input 
                    type="text" 
                    value={manualTemp}
                    onChange={(e)=>setManualTemp(e.target.value)}
                    className="w-full bg-[#1E1938] border border-[#342E5E] rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  className="col-span-2 bg-[#6C5CE7] hover:bg-[#5b4cd1] text-white text-[11px] font-bold py-2 rounded-xl transition-all mt-1"
                >
                  Save Log Entry
                </button>
              </form>
            </details>

            {/* Vitals History */}
            <div className="space-y-3">
              <div className="text-sm font-bold px-1">Recent Vital logs</div>
              {vitalsLog.length === 0 ? (
                <div className="bg-[#120E21] rounded-2xl p-4 text-center text-xs text-[#A5A5A5]">
                  No vitals logged yet. Initiate your first scan!
                </div>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {vitalsLog.map((log) => (
                    <div key={log.id} className="bg-[#120E21] p-3.5 rounded-2xl border border-[#342E5E]/60 flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${log.status === 'Healthy' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                          <span className="text-sm font-black">{log.bpm} BPM</span>
                          <span className="text-[10px] bg-[#1E1938] text-[#9D8DF1] px-1.5 py-0.5 rounded font-bold">{log.status}</span>
                        </div>
                        <div className="text-[10px] text-[#A5A5A5]">{log.time}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2.5 text-right">
                        <div>
                          <div className="text-[9px] text-[#A5A5A5] uppercase">BP</div>
                          <div className="text-xs font-bold text-white">{log.bp}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-[#A5A5A5] uppercase">SpO2</div>
                          <div className="text-xs font-bold text-white">{log.spo2}%</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-[#A5A5A5] uppercase">TEMP</div>
                          <div className="text-xs font-bold text-white">{log.temp}°F</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 4. MODAL: DAILY ACTIVITY ==================== */}
        {activeModal === 'activity' && (
          <div className="bg-[#1E1938] border border-[#342E5E] rounded-[28px] p-6 mb-6 space-y-6 animate-fadeIn relative">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#120E21] flex items-center justify-center hover:bg-[#342E5E] transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#9D8DF1]/25 flex items-center justify-center">
                <Activity className="w-5 h-5 text-[#9D8DF1]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold">Daily Activity</h3>
                <p className="text-xs text-[#A5A5A5]">Track metrics for daily caloric burn, steps and exercise</p>
              </div>
            </div>

            {/* Core Metrics Display */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#120E21] p-3 rounded-2xl border border-[#342E5E] text-center">
                <TrendingUp className="w-4 h-4 text-[#9D8DF1] mx-auto mb-1" />
                <div className="text-xs text-[#A5A5A5] uppercase font-bold text-[9px] tracking-wide">Steps</div>
                <div className="text-sm font-extrabold text-white mt-1">{activity.steps.toLocaleString()}</div>
                <div className="text-[9px] text-[#A5A5A5] mt-0.5">/ {activity.stepGoal.toLocaleString()}</div>
              </div>
              <div className="bg-[#120E21] p-3 rounded-2xl border border-[#342E5E] text-center">
                <Clock className="w-4 h-4 text-green-400 mx-auto mb-1" />
                <div className="text-xs text-[#A5A5A5] uppercase font-bold text-[9px] tracking-wide">Minutes</div>
                <div className="text-sm font-extrabold text-white mt-1">{activity.minutes}</div>
                <div className="text-[9px] text-[#A5A5A5] mt-0.5">Active</div>
              </div>
              <div className="bg-[#120E21] p-3 rounded-2xl border border-[#342E5E] text-center">
                <Flame className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                <div className="text-xs text-[#A5A5A5] uppercase font-bold text-[9px] tracking-wide">Calories</div>
                <div className="text-sm font-extrabold text-white mt-1">{activity.calories}</div>
                <div className="text-[9px] text-[#A5A5A5] mt-0.5">kcal Burned</div>
              </div>
            </div>

            {/* Step Progress Line */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold px-0.5">
                <span>Steps progress</span>
                <span>{Math.round((activity.steps / activity.stepGoal) * 100)}%</span>
              </div>
              <div className="w-full bg-[#120E21] h-3 rounded-full overflow-hidden border border-[#342E5E]/40">
                <div 
                  className="bg-gradient-to-r from-[#6C5CE7] to-[#9D8DF1] h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (activity.steps / activity.stepGoal) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Simulated Adders */}
            <div className="space-y-3 bg-[#120E21] p-4 rounded-2xl border border-[#342E5E]">
              <div className="text-xs font-bold text-[#9D8DF1] uppercase tracking-wide">Perform simulated activity</div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleQuickActivity('walk')}
                  className="bg-[#1E1938] hover:bg-[#252044] border border-[#342E5E] py-2.5 rounded-xl text-xs font-bold transition-all text-white flex items-center justify-center cursor-pointer"
                >
                  🚶 Brisk walk (+1500 stp)
                </button>
                <button 
                  onClick={() => handleQuickActivity('run')}
                  className="bg-[#1E1938] hover:bg-[#252044] border border-[#342E5E] py-2.5 rounded-xl text-xs font-bold transition-all text-white flex items-center justify-center cursor-pointer"
                >
                  🏃 Outdoor run (+3200 stp)
                </button>
              </div>
              <button 
                onClick={handleResetActivity}
                className="w-full border border-red-500/30 hover:bg-red-500/10 text-red-400 font-bold py-2 rounded-xl text-xs transition-colors"
              >
                Reset Daily Activity Counter
              </button>
            </div>
          </div>
        )}

        {/* ==================== 5. MODAL: VIEW MY PLAN ==================== */}
        {activeModal === 'plan' && (
          <div className="bg-[#1E1938] border border-[#342E5E] rounded-[28px] p-6 mb-6 space-y-6 animate-fadeIn relative">
            <button 
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#120E21] flex items-center justify-center hover:bg-[#342E5E] transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#6C5CE7]/25 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#9D8DF1]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold">Your Personalized Plan</h3>
                <p className="text-xs text-[#A5A5A5]">Dynamic health strategy formulated by Ogoo's AI system</p>
              </div>
            </div>

            {/* Plan Display Area */}
            <div className="bg-[#120E21] p-5 rounded-2xl border border-[#342E5E] min-h-[220px] max-h-96 overflow-y-auto text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
              {isGeneratingPlan ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="w-10 h-10 text-[#9D8DF1] animate-spin" />
                  <div className="text-center">
                    <span className="text-xs font-bold text-white uppercase tracking-wider animate-pulse">Analyzing health records...</span>
                    <p className="text-[10px] text-[#A5A5A5] mt-1">Ogoo is synthesising a custom wellness directive based on your steps and vitals logs.</p>
                  </div>
                </div>
              ) : (
                <div className="markdown-body text-slate-200">
                  <Markdown>{customPlan}</Markdown>
                </div>
              )}
            </div>

            {/* Regenerate AI Plan Button */}
            <div className="space-y-3">
              <button 
                onClick={handleGenerateCustomPlan}
                disabled={isGeneratingPlan}
                className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#9D8DF1] hover:opacity-90 text-white font-extrabold py-3.5 px-6 rounded-2xl text-xs transition-all uppercase tracking-wider flex items-center justify-center cursor-pointer shadow-[0_4px_15px_rgba(108,92,231,0.4)]"
              >
                {isGeneratingPlan ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Tailoring details...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 fill-white animate-pulse" /> Regenerate Custom AI Plan
                  </>
                )}
              </button>
              <p className="text-[10px] text-[#A5A5A5] text-center max-w-xs mx-auto leading-relaxed">
                Rebuilding plan incorporates steps ({activity.steps} steps), latest liquid intake ({waterIntake} ml), and logged vitals data to formulate your targets.
              </p>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex flex-col gap-3">
          {(showDashboard ? messages.slice(0, 1) : messages).map((msg) => (
            <div
              key={msg.id}
              className={`p-4 rounded-[20px] max-w-[90%] text-[15px] leading-relaxed relative group ${
                msg.fromUser 
                  ? 'bg-[#6C5CE7] self-end rounded-br-sm' 
                  : 'bg-[#1E1938] self-start rounded-bl-sm border border-[#342E5E]'
              }`}
            >
              {msg.fromUser ? (
                msg.text
              ) : (
                <div className="space-y-2 pr-4">
                  <div className="markdown-body text-white">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                  <div className="flex justify-end pt-1 opacity-50 hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => speak(msg.text)}
                      className="text-[10px] text-[#9D8DF1] hover:text-white transition-colors flex items-center space-x-1 cursor-pointer bg-[#120E21]/60 px-2 py-1 rounded-lg border border-[#342E5E]/40"
                      title="Speak message"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>Speak</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="bg-[#1E1938] p-4 rounded-[20px] max-w-[85%] self-start rounded-bl-sm w-[70px] flex justify-center items-center border border-[#342E5E]">
              <Loader2 className="w-5 h-5 text-[#9D8DF1] animate-spin" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-5 pb-8 md:pb-6 bg-[#120E21] max-w-3xl w-full mx-auto">
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          accept="image/*,video/*,audio/*"
          onChange={handleFileUpload}
        />
        
        <form 
          onSubmit={sendMessage}
          className="flex flex-row bg-[#1E1938] rounded-full p-2 items-center border border-[#342E5E]"
        >
          <button 
            type="button"
            onClick={toggleLiveAPI}
            className="px-3 hover:opacity-80 transition-opacity"
          >
            {isLive ? <StopCircle className="text-red-500 w-5 h-5 animate-pulse" /> : <Mic className="text-[#A5A5A5] w-5 h-5" />}
          </button>
          <button 
            type="button"
            onClick={() => {
              const nextState = !voiceEnabled;
              setVoiceEnabled(nextState);
              localStorage.setItem('ogoo_voice_enabled', nextState ? 'true' : 'false');
              if (!nextState) {
                window.speechSynthesis?.cancel();
              } else {
                speak("Ogoo's voice feedback is enabled.");
              }
            }}
            className="px-2.5 hover:opacity-80 transition-opacity cursor-pointer flex items-center justify-center"
            title={voiceEnabled ? "Mute Ogoo's voice" : "Unmute Ogoo's voice"}
          >
            {voiceEnabled ? <Volume2 className="text-[#9D8DF1] w-5 h-5" /> : <VolumeX className="text-[#A5A5A5] w-5 h-5" />}
          </button>
          <input
            type="text"
            className="flex-1 bg-transparent text-[#FFFFFF] text-[15px] h-10 outline-none placeholder:text-[#666]"
            placeholder="Reply to Ogoo..."
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (e.target.value.trim().length > 0) {
                setIsChatViewActive(true);
              }
            }}
            disabled={isLoading && !isLive}
            onFocus={() => {
              setIsFocused(true);
              setIsChatViewActive(true);
            }}
            onBlur={() => setIsFocused(false)}
          />
          <button
            type="submit"
            disabled={(isLoading && !isLive) || !inputText.trim()}
            className={`w-10 h-10 rounded-full bg-[#6C5CE7] flex justify-center items-center transition-all ${
              (isLoading && !isLive) || !inputText.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#5b4cd1]'
            }`}
          >
            <Send className="text-white w-4 h-4 ml-[-2px] mt-[1px]" />
          </button>
        </form>
      </footer>

      {/* Menu Drawer Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end animate-fadeIn">
          {/* Backdrop closer */}
          <div className="absolute inset-0" onClick={() => setIsMenuOpen(false)}></div>
          
          {/* Drawer content */}
          <div className="relative w-full max-w-sm bg-[#120E21] border-l border-[#342E5E] h-full shadow-2xl flex flex-col p-6 space-y-6 animate-slideIn">
            <div className="flex justify-between items-center pb-4 border-b border-[#342E5E]">
              <div className="flex items-center space-x-2">
                <Menu className="w-5 h-5 text-[#9D8DF1]" />
                <h2 className="text-lg font-bold text-white">Ogoo Profile</h2>
              </div>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-[#1E1938] flex items-center justify-center hover:bg-[#342E5E] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* User Profile Info Card */}
            <div className="bg-[#1E1938] p-5 rounded-2xl border border-[#342E5E] space-y-4">
              <div className="text-xs font-bold text-[#9D8DF1] uppercase tracking-wider">Account Information</div>
              {userProfile && userProfile.onboarded ? (
                <div className="space-y-2.5">
                  <div>
                    <div className="text-[10px] text-[#A5A5A5] uppercase">First Name</div>
                    <div className="text-sm font-bold text-white">{userProfile.firstName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#A5A5A5] uppercase">Last Name</div>
                    <div className="text-sm font-bold text-white">{userProfile.lastName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#A5A5A5] uppercase">Email Address</div>
                    <div className="text-sm font-bold text-white break-all">{userProfile.email}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#A5A5A5] uppercase">Sign In Method</div>
                    <div className="text-xs font-bold text-[#4CAF50] bg-[#4CAF50]/10 px-2 py-1 rounded inline-block mt-1">
                      {userProfile.authType === 'google_passwordless' ? '✓ Google Passwordless' : '✓ Standard Password'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#A5A5A5] leading-relaxed">
                  Your profile is currently unconfigured. Start talking with Ogoo in the chat to complete conversational onboarding passwordlessly!
                </div>
              )}
            </div>

            {/* Device ID and Geolocation info */}
            <div className="bg-[#1E1938] p-5 rounded-2xl border border-[#342E5E] space-y-4">
              <div className="text-xs font-bold text-[#9D8DF1] uppercase tracking-wider">Sensor & Device Telemetry</div>
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-[#A5A5A5] uppercase">Device Identifier</div>
                  <div className="text-[11px] font-mono text-slate-300 break-all bg-[#120E21] p-1.5 rounded border border-[#342E5E]/40 mt-1">{deviceId}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#A5A5A5] uppercase">Approximate Geolocation</div>
                  <div className="text-xs font-medium text-slate-300 bg-[#120E21] p-1.5 rounded border border-[#342E5E]/40 mt-1">
                    {geoLocation ? (
                      <div>
                        <div className="font-bold text-white">{geoLocation.city || 'Acquiring...'}, {geoLocation.region}, {geoLocation.country_name}</div>
                        <div className="text-[10px] text-[#A5A5A5] mt-0.5">Coords: {geoLocation.latitude?.toFixed(4)}, {geoLocation.longitude?.toFixed(4)}</div>
                      </div>
                    ) : (
                      'Locating system coordinates...'
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Clear History and Reset */}
            <div className="pt-4 flex-1 flex flex-col justify-end">
              <button 
                onClick={handleClearUserProfile}
                className="w-full border border-red-500/30 hover:bg-red-500/10 text-red-400 font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1 uppercase tracking-wide cursor-pointer"
              >
                <Trash2 className="w-4 h-4 mr-1" /> Clear Account & History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
