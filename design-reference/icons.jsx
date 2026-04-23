// Minimal line icons, Lucide-style
const Icon = ({ path, size = 16, strokeWidth = 1.75, fill = 'none', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, ...style }}>
    {path}
  </svg>
);

const IconArrowRight = (p) => <Icon {...p} path={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>} />;
const IconArrowUp    = (p) => <Icon {...p} path={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>} />;
const IconArrowLeft  = (p) => <Icon {...p} path={<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>} />;
const IconPlus       = (p) => <Icon {...p} path={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />;
const IconSearch     = (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>} />;
const IconMessage    = (p) => <Icon {...p} path={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>} />;
const IconUser       = (p) => <Icon {...p} path={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>} />;
const IconLogout     = (p) => <Icon {...p} path={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>} />;
const IconSettings   = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>} />;
const IconTrash      = (p) => <Icon {...p} path={<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>} />;
const IconEye        = (p) => <Icon {...p} path={<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>} />;
const IconEyeOff     = (p) => <Icon {...p} path={<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>} />;
const IconCheck      = (p) => <Icon {...p} path={<polyline points="20 6 9 17 4 12"/>} />;
const IconSparkles   = (p) => <Icon {...p} path={<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM5 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>} />;
const IconChevronDown= (p) => <Icon {...p} path={<polyline points="6 9 12 15 18 9"/>} />;
const IconChevronLeft= (p) => <Icon {...p} path={<polyline points="15 18 9 12 15 6"/>} />;
const IconBookmark   = (p) => <Icon {...p} path={<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>} />;
const IconBell       = (p) => <Icon {...p} path={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>} />;
const IconMapPin     = (p) => <Icon {...p} path={<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>} />;
const IconExternal   = (p) => <Icon {...p} path={<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>} />;
const IconCalendar   = (p) => <Icon {...p} path={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>} />;
const IconMenu       = (p) => <Icon {...p} path={<><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>} />;
const IconPanelLeft  = (p) => <Icon {...p} path={<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>} />;
const IconDatabase   = (p) => <Icon {...p} path={<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></>} />;
const IconActivity   = (p) => <Icon {...p} path={<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>} />;
const IconShield     = (p) => <Icon {...p} path={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>} />;
const IconRefresh    = (p) => <Icon {...p} path={<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>} />;
const IconNetwork    = (p) => <Icon {...p} path={<><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M12 11l-7 8M12 11l7 8"/></>} />;
const IconClock      = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>} />;
const IconFileText   = (p) => <Icon {...p} path={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></>} />;
const IconBot        = (p) => <Icon {...p} path={<><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></>} />;
const IconWorkflow   = (p) => <Icon {...p} path={<><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/></>} />;
const IconMore       = (p) => <Icon {...p} path={<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>} />;

Object.assign(window, {
  Icon, IconArrowRight, IconArrowUp, IconArrowLeft, IconPlus, IconSearch, IconMessage,
  IconUser, IconLogout, IconSettings, IconTrash, IconEye, IconEyeOff, IconCheck,
  IconSparkles, IconChevronDown, IconChevronLeft, IconBookmark, IconBell, IconMapPin,
  IconExternal, IconCalendar, IconMenu, IconPanelLeft,
  IconDatabase, IconActivity, IconShield, IconRefresh, IconNetwork, IconClock,
  IconFileText, IconBot, IconWorkflow, IconMore,
});
