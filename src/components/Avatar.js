import React from 'react';

const COLORS = ['#185FA5','#0F6E56','#8B44B8','#C55A1B','#A32D2D','#2B6CB0'];

export const getPersonColor = (i) => COLORS[i % COLORS.length];

export default function Avatar({ name, index = 0, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: COLORS[index % COLORS.length], color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.42), fontWeight: 700, lineHeight: 1,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {name ? name.charAt(0) : '?'}
    </div>
  );
}
