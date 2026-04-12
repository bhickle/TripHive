'use client';

import React from 'react';
import { Message } from '@/lib/types';
import { Avatar } from './Avatar';

interface ChatBubbleProps {
  message: Message;
  showAvatar?: boolean;
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  showAvatar = true,
}) => {
  const isOwn = message.isOwn;

  return (
    <div className={`flex gap-3 mb-4 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {showAvatar && (
        <div className="flex-shrink-0 mt-1">
          <Avatar
            src={message.senderAvatar}
            name={message.senderName}
            size="sm"
          />
        </div>
      )}

      {/* Message Container */}
      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-xs`}>
        {/* Sender Name and Time (only for others' messages on first message) */}
        {!isOwn && (
          <div className="flex items-baseline gap-2 mb-1 px-3">
            <span className="text-sm font-semibold text-slate-900">
              {message.senderName}
            </span>
            <span className="text-xs text-slate-500">
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={`px-4 py-2.5 rounded-2xl break-words ${
            isOwn
              ? 'bg-sky-800 text-white rounded-br-none'
              : 'bg-slate-100 text-slate-900 rounded-bl-none'
          }`}
        >
          <p className="text-sm leading-relaxed">
            {message.content}
          </p>
        </div>

        {/* Time (for own messages) */}
        {isOwn && (
          <span className="text-xs text-slate-500 mt-1 px-3">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
};

interface ChatContainerProps {
  messages: Message[];
  showAvatars?: boolean;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  showAvatars = true,
}) => {
  return (
    <div className="space-y-1">
      {messages.map((message) => (
        <ChatBubble
          key={message.id}
          message={message}
          showAvatar={showAvatars}
        />
      ))}
    </div>
  );
};
