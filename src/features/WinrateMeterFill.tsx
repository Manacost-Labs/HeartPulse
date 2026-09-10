import { useEffect, useState } from 'react';
import './WinrateMeterFill.css';

type WinrateMeterFillProps = {
  color: string;
  delayMs?: number;
  label: string;
  scale: number;
};

export function WinrateMeterFill({ color, delayMs = 0, label, scale }: WinrateMeterFillProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <div
        className="arena-class-meter-fill absolute inset-y-0 left-0 rounded-full"
        style={{
          width: '100%',
          transform: `scaleX(${visible ? scale : 0})`,
          transitionDelay: `${delayMs}ms`,
          backgroundImage: `linear-gradient(180deg, ${color}ff 0%, ${color}cc 100%)`,
          boxShadow: `inset 0 2px 5px rgba(255,255,255,0.25), inset 0 -2px 5px rgba(0,0,0,0.35), 0 0 12px ${color}66`,
        }}
      >
        <div className="absolute inset-x-0 top-0 h-[40%] rounded-t-full"
          style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.3),transparent)' }} />
      </div>
      <span className="arena-class-meter-label relative z-10 font-bold text-xs sm:text-sm tracking-wide">
        {label}
      </span>
    </>
  );
}
