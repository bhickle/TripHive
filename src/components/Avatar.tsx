'use client';

import React from 'react';
import Image from 'next/image';

interface AvatarProps {
  src?: string;
  initials?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  status?: 'online' | 'offline' | 'away';
  className?: string;
}

interface AvatarStackProps {
  avatars: Array<{
    src?: string;
    initials?: string;
    name?: string;
  }>;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

const statusDotSize = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-slate-400',
  away: 'bg-sky-800',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  initials,
  name,
  size = 'md',
  status,
  className = '',
}) => {
  const displayInitials = initials || (name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?');

  return (
    <div className={`relative inline-flex ${className}`}>
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gradient-earth flex items-center justify-center flex-shrink-0`}>
        {src ? (
          <Image
            src={src}
            alt={name || 'Avatar'}
            fill
            className="object-cover"
          />
        ) : (
          <span className="font-semibold text-white">{displayInitials}</span>
        )}
      </div>
      {status && (
        <div
          className={`absolute bottom-0 right-0 ${statusDotSize[size]} rounded-full border-2 border-white ${statusColors[status]}`}
        />
      )}
    </div>
  );
};

export const AvatarStack: React.FC<AvatarStackProps> = ({
  avatars,
  max = 3,
  size = 'md',
  className = '',
}) => {
  const displayed = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={`flex -space-x-2 ${className}`}>
      {displayed.map((avatar, index) => (
        <div key={index} className="ring-2 ring-white">
          <Avatar
            src={avatar.src}
            initials={avatar.initials}
            name={avatar.name}
            size={size}
          />
        </div>
      ))}
      {remaining > 0 && (
        <div className={`${sizeClasses[size]} rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 ring-2 ring-white`}>
          +{remaining}
        </div>
      )}
    </div>
  );
};
