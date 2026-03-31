/**
 * SCORM Time Utilities for LMS
 */

/**
 * Parses SCORM 1.2 time format (HH:MM:SS or HHHH:MM:SS.SS) 
 * or SCORM 2004 ISO 8601 duration (PT1H2M3S) into seconds.
 */
export function parseScormTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    if (typeof timeStr === 'number') return Math.floor(timeStr);
    return 0;
  }

  const cleanTime = timeStr.trim();
  if (!cleanTime) return 0;

  // 1. Check for SCORM 2004 ISO 8601 format (PT1H2M3S)
  if (cleanTime.startsWith('PT')) {
    let totalSeconds = 0;
    const matches = {
      'H': 3600,
      'M': 60,
      'S': 1
    };
    
    for (let unit in matches) {
      // Handle decimals in seconds (e.g., PT2.5S)
      const regex = unit === 'S' ? new RegExp('([\\\\d.]+)' + unit) : new RegExp('(\\\\d+)' + unit);
      const match = cleanTime.match(regex);
      if (match) {
        totalSeconds += parseFloat(match[1]) * matches[unit];
      }
    }
    return Math.floor(totalSeconds);
  }

  // 2. Check for SCORM 1.2 format (HH:MM:SS) or variants (MM:SS)
  const parts = cleanTime.split(':');
  if (parts.length >= 2) {
    let seconds = 0;
    let minutes = 0;
    let hours = 0;
    
    if (parts.length === 3) {
      hours = parseFloat(parts[0]) || 0;
      minutes = parseFloat(parts[1]) || 0;
      seconds = parseFloat(parts[2]) || 0;
    } else if (parts.length === 2) {
      minutes = parseFloat(parts[0]) || 0;
      seconds = parseFloat(parts[1]) || 0;
    }
    
    const total = (hours * 3600) + (minutes * 60) + seconds;
    return isNaN(total) ? 0 : Math.floor(total);
  }

  // 3. Last Resort: Try parsing as generic float/number
  const num = parseFloat(cleanTime);
  return isNaN(num) ? 0 : Math.floor(num);
}

/**
 * Formats seconds back to SCORM 1.2 format (HH:MM:SS)
 */
export function formatScorm12Time(seconds) {
  const total = Math.floor(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0')
  ].join(':');
}

/**
 * Formats seconds to SCORM 2004 ISO 8601 Duration (PT1H2M3S)
 */
export function formatScorm2004Time(seconds) {
  const total = Math.floor(seconds || 0);
  if (total === 0) return 'PT0S';
  
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  
  let res = 'PT';
  if (h > 0) res += h + 'H';
  if (m > 0) res += m + 'M';
  if (s > 0 || (h === 0 && m === 0)) res += s + 'S';
  return res;
}
