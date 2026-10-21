'use client';

import { useContext, type MouseEvent, type ReactNode } from 'react';
import { animateSpring, composeHandlers, cx, themeSlowMs } from '../primitives';
import { Button, type ButtonProps } from './Button';
import './IconButton.css';
import { TooltipTriggerContext } from './Tooltip';
import { withRef } from '../primitives/react-compat';

export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children' | 'fullWidth' | 'asChild'> {
  /** The icon shown as the button's only content. */
  icon: ReactNode;
  /** Required accessible name (used as aria-label, and as the native title unless wrapped in a Tooltip). */
  label: string;
  /** Circle instead of the theme's default button radius. */
  round?: boolean;
  /**
   * On each click the icon pops and a ring of particles bursts out in its colour — confirmation for a
   * like or a favourite (show the new state too, e.g. a filled icon). Skipped under reduced motion.
   */
  burst?: boolean;
}

const PARTICLES = 8;

/** Sends a ring of particles out of `button` and pops its icon; the particles remove themselves. */
function burstFrom(button: HTMLElement) {
  if (typeof button.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const icon = button.querySelector('.ui-button__icon');
  if (icon) animateSpring(icon, { transform: ['scale(0.6)', 'none'] }, 'bouncy');
  const duration = (620 * themeSlowMs(button)) / 340;
  const reach = button.offsetWidth * 0.8;
  for (let i = 0; i < PARTICLES; i++) {
    const angle = ((i + Math.random() * 0.4) / PARTICLES) * Math.PI * 2;
    const distance = reach * (0.75 + Math.random() * 0.35);
    const particle = document.createElement('span');
    particle.className = 'ui-icon-button__particle';
    particle.setAttribute('aria-hidden', 'true');
    button.append(particle);
    const flight = particle.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(0)`,
          opacity: 0,
        },
      ],
      { duration, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
    flight.onfinish = flight.oncancel = () => particle.remove();
  }
}

export const IconButton = withRef(function IconButton({ icon, label, round, burst = false, variant = 'ghost', className, title, onClick, ...rest }: IconButtonProps) {
  // A surrounding <Tooltip> already shows the label; a native title would double it.
  const inTooltip = useContext(TooltipTriggerContext);
  return (
    <Button
      {...rest}
      variant={variant}
      aria-label={label}
      title={title ?? (inTooltip ? undefined : label)}
      data-icon-only=""
      pill={round}
      className={cx('ui-icon-button', className)}
      leftIcon={icon}
      onClick={burst ? composeHandlers(onClick, (event: MouseEvent<HTMLButtonElement>) => burstFrom(event.currentTarget)) : onClick}
    />
  );
});
