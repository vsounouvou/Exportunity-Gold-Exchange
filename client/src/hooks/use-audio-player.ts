import { useState, useRef, useEffect, useCallback } from 'react';

interface AudioQueueItem {
  id: string;
  url: string;
  text: string;
  onComplete?: () => void;
}

export function useAudioPlayer() {
  const [queue, setQueue] = useState<AudioQueueItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentItem, setCurrentItem] = useState<AudioQueueItem | null>(null);
  const [userGestureReceived, setUserGestureReceived] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const initializeAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentItem(null);
        setQueue(prev => prev.slice(1));
      });
      audioRef.current.addEventListener('error', (e) => {
        console.error('[AudioPlayer] Playback error:', e);
        setIsPlaying(false);
        setCurrentItem(null);
        setQueue(prev => prev.slice(1));
      });
    }
  }, []);

  const enqueue = useCallback((item: AudioQueueItem) => {
    setQueue(prev => [...prev, item]);
  }, []);

  const play = useCallback(async () => {
    if (!audioRef.current || !currentItem) return;

    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error: any) {
      console.error('[AudioPlayer] Failed to play:', error);
      
      if (error.name === 'NotAllowedError') {
        setUserGestureReceived(false);
      }
    }
  }, [currentItem]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentItem(null);
    setQueue([]);
  }, []);

  const enableAudio = useCallback(() => {
    setUserGestureReceived(true);
  }, []);

  useEffect(() => {
    initializeAudio();
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [initializeAudio]);

  useEffect(() => {
    if (queue.length > 0 && !currentItem) {
      const nextItem = queue[0];
      setCurrentItem(nextItem);
      
      if (audioRef.current) {
        audioRef.current.src = nextItem.url;
        audioRef.current.load();
        
        if (userGestureReceived) {
          play();
        }
      }
    }
  }, [queue, currentItem, userGestureReceived, play]);

  useEffect(() => {
    if (userGestureReceived && currentItem && audioRef.current && !isPlaying) {
      play();
    }
  }, [userGestureReceived, currentItem, isPlaying, play]);

  return {
    enqueue,
    play,
    pause,
    stop,
    enableAudio,
    isPlaying,
    currentItem,
    queueLength: queue.length,
    needsUserGesture: !userGestureReceived,
  };
}
