import { useState } from 'react'
import { useT } from '../../theme.jsx'
import { SIGUNGU_MAP } from '../../utils/region.js'

// ─── 시/군/구 드롭다운 + 직접입력 혼합 필드 ─────────────────────────────
// sido 없음        → 비활성화 셀렉트 (시/도 먼저 선택하도록 안내)
// SIGUNGU_MAP[sido]가 빈 배열(세종) → 목록 없이 직접입력만 노출
// 그 외              → 표준 목록 + 직접입력
export function SigunguField({ sido, value, onChange, inputStyle, disabledLabel }) {
  const C = useT()
  const list = sido ? (SIGUNGU_MAP[sido] ?? []) : null
  // 직접입력 모드는 effect 없이 파생: 값이 목록에 없거나, 사용자가 이 시/도에서 '직접입력'을 고른 경우.
  // directFor 에 시/도를 기억해 두므로 값이 비어 있어도 입력창이 유지되고, 시/도가 바뀌면 자동 해제된다.
  const isCustom = !!value && !!list && !list.includes(value)
  const [directFor, setDirectFor] = useState(null)
  const direct = isCustom || directFor === sido

  const baseStyle = inputStyle ?? {
    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.s3, color: C.text, fontSize: 13, width: '100%',
    outline: 'none', boxSizing: 'border-box',
  }

  if (!sido) {
    return (
      <select disabled value="" style={{ ...baseStyle, opacity: 0.6, cursor: 'not-allowed' }}>
        <option value="">{disabledLabel ?? '시/도 먼저 선택'}</option>
      </select>
    )
  }

  if (list.length === 0) {
    return (
      <input
        style={baseStyle}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        placeholder="예: 조치원읍"
      />
    )
  }

  const selectVal = direct ? '직접입력' : (value ?? '')

  const handleSelect = (e) => {
    const v = e.target.value
    if (v === '직접입력') { setDirectFor(sido); onChange(null) }
    else if (v === '') { setDirectFor(null); onChange(null) }
    else { setDirectFor(null); onChange(v) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select value={selectVal} onChange={handleSelect} style={{ ...baseStyle, cursor: 'pointer' }}>
        <option value="">시/군/구 선택</option>
        {list.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        <option value="직접입력">직접입력</option>
      </select>
      {direct && (
        <input
          style={baseStyle}
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          placeholder="예: 군산시"
          autoFocus
        />
      )}
    </div>
  )
}
