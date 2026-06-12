// apps/web/src/components/Pagination.tsx
interface Props {
    page: number; totalPages: number; totalItems: number;
    pageSize: number; onChange: (p: number) => void;
  }
  export function Pagination({ page, totalPages, totalItems, pageSize, onChange }: Props) {
    if (totalPages <= 1) return null;
    const from = (page - 1) * pageSize + 1;
    const to   = Math.min(page * pageSize, totalItems);
    const nums: (number | '…')[] = [];
    let prev = 0;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
        if (prev && i - prev > 1) nums.push('…');
        nums.push(i); prev = i;
      }
    }
    const btn = (label: string, disabled: boolean, onClick: () => void, active = false) => (
      <button key={label} disabled={disabled} onClick={onClick} style={{
        padding: '5px 11px', fontSize: '12px', fontWeight: active ? 700 : 500,
        borderRadius: '8px', cursor: disabled ? 'default' : 'pointer',
        border: active ? '1.5px solid #f97316' : '1px solid #e5e7eb',
        background: active ? '#fff7ed' : disabled ? '#f9fafb' : '#ffffff',
        color: active ? '#f97316' : disabled ? '#d1d5db' : '#374151',
      }}>{label}</button>
    );
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 16px', borderTop:'1px solid #f1f5f9', background:'#ffffff',
        flexWrap:'wrap', gap:'8px' }}>
        <span style={{ fontSize:'12px', color:'#6b7280' }}>Showing {from}–{to} of {totalItems}</span>
        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
          {btn('← Prev', page===1, () => onChange(page-1))}
          {nums.map((n,i) => n==='…'
            ? <span key={`e${i}`} style={{color:'#9ca3af',padding:'0 6px',fontSize:'13px'}}>…</span>
            : btn(String(n), false, () => onChange(n as number), page===n)
          )}
          {btn('Next →', page===totalPages, () => onChange(page+1))}
        </div>
      </div>
    );
  }
  