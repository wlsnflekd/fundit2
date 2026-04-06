import { useState, useEffect } from 'react'
import { useT } from '../theme.jsx'
import { getFunds, createFund } from '../supabase.js'

const TYPE_FILTERS = ['전체', 'R&D', '융자', '보조', '바우처']
const TYPE_COLOR = { 'R&D': '#3498db', '융자': '#27ae60', '보조': '#e67e22', '바우처': '#9b59b6' }

function dday(dateStr) {
  if (!dateStr) return { label: '-', color: undefined }
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (diff < 0) return { label: '마감', color: '#95a5a6' }
  if (diff === 0) return { label: 'D-Day', color: '#e74c3c' }
  if (diff <= 7) return { label: `D-${diff}`, color: '#e74c3c' }
  if (diff <= 30) return { label: `D-${diff}`, color: '#f39c12' }
  return { label: `D-${diff}`, color: undefined }
}

// 정책자금 등록 패널
function CreateFundPanel({ onClose, onCreated }) {
  const C = useT()
  const [form, setForm] = useState({ name: '', org: '', type: 'R&D', max_amount: '', rate: '0', deadline: '', description: '', tags: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('사업명을 입력해주세요.'); return }
    setSaving(true)
    setErr('')
    const payload = {
      name: form.name.trim(),
      org: form.org.trim() || null,
      type: form.type,
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
      rate: form.rate !== '' ? parseFloat(form.rate) : 0,
      deadline: form.deadline || null,
      description: form.description.trim() || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const { data, error } = await createFund(payload)
    setSaving(false)
    if (error) { setErr('저장 중 오류가 발생했습니다.'); console.error(error); return }
    onCreated(data)
    onClose()
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: C.s3, border: `1px solid ${C.line}`,
    borderRadius: 8, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 12, color: C.sub, marginBottom: 4, display: 'block' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: C.s2, borderLeft: `1px solid ${C.line}`,
        zIndex: 101, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: `1px solid ${C.line}`,
          position: 'sticky', top: 0, background: C.s2, zIndex: 1,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>정책자금 직접 등록</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>사업명 *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="정책자금 사업명 입력" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>주관기관</label>
            <input value={form.org} onChange={e => set('org', e.target.value)} placeholder="예: 중소벤처기업부" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>유형</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
                {['R&D', '융자', '보조', '바우처'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>최대금액 (억원)</label>
              <input type="number" step="0.1" value={form.max_amount} onChange={e => set('max_amount', e.target.value)} placeholder="0.0" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>금리 (%)</label>
              <input type="number" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="0 = 무이자" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>마감일</label>
              <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>사업 설명</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="사업 개요 간략 입력" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>태그 (쉼표 구분)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="예: 제조업, R&D, 스마트공장" style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 12, color: '#dc3545' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d', fontWeight: 700, fontSize: 13,
                opacity: saving ? 0.7 : 1,
              }}
            >{saving ? '저장 중...' : '등록하기'}</button>
            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function Funds() {
  const C = useT()
  const [funds, setFunds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('전체')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await getFunds()
    if (err) {
      console.error(err)
      setError('정책자금 목록을 불러오지 못했습니다. 다시 시도해주세요.')
    } else {
      setFunds(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = funds.filter(f => {
    const matchType = typeFilter === '전체' || f.type === typeFilter
    const matchSearch = f.name?.includes(search) || f.org?.includes(search) || (f.tags ?? []).some(t => t.includes(search))
    return matchType && matchSearch
  })

  const th = { textAlign: 'left', padding: '8px 12px', color: C.sub, fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${C.line}` }
  const td = { padding: '10px 12px', color: C.text, fontSize: 13, borderBottom: `1px solid ${C.line}` }

  const handleCreated = (newFund) => {
    setFunds(prev => [newFund, ...prev])
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>불러오는 중...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: '#dc3545', marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.s3, color: C.text, cursor: 'pointer', fontSize: 13 }}>다시 시도</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: C.text }}>정책자금 목록</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d', fontWeight: 700, fontSize: 13,
            }}
          >+ 직접 등록</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TYPE_FILTERS.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            padding: '4px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: typeFilter === t ? C.gold : C.s3, color: typeFilter === t ? C.base : C.sub
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="사업명·기관·태그 검색"
          style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.s3, color: C.text, fontSize: 12, width: 180 }} />
      </div>

      <div style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>사업명</th>
              <th style={th}>주관기관</th>
              <th style={{ ...th, textAlign: 'center' }}>유형</th>
              <th style={{ ...th, textAlign: 'right' }}>최대금액</th>
              <th style={{ ...th, textAlign: 'right' }}>금리</th>
              <th style={th}>마감일</th>
              <th style={th}>태그</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => {
              const dd = dday(f.deadline)
              return (
                <tr key={f.id} style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = C.s3} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{f.name}</div>
                    {f.description && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{f.description}</div>}
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>{f.org ?? '-'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {f.type ? (
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: (TYPE_COLOR[f.type] ?? '#888') + '33', color: TYPE_COLOR[f.type] ?? '#888' }}>{f.type}</span>
                    ) : '-'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                    {f.max_amount != null
                      ? (f.max_amount >= 10 ? `${f.max_amount}억` : `${(f.max_amount * 100000000).toLocaleString()}원`)
                      : '-'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: f.rate === 0 ? C.green : C.text }}>
                    {f.rate === 0 ? '무이자' : f.rate != null ? `${f.rate}%` : '-'}
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>
                    <div>{f.deadline ?? '-'}</div>
                    {f.deadline && <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: dd.color }}>{dd.label}</div>}
                  </td>
                  <td style={td}>
                    {(f.tags ?? []).map(t => (
                      <span key={t} style={{ marginRight: 4, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: C.s3, color: C.sub, border: `1px solid ${C.line}`, display: 'inline-block', marginBottom: 2 }}>{t}</span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>
            {funds.length === 0 ? '등록된 정책자금이 없습니다. 직접 등록해보세요!' : '검색 결과가 없습니다.'}
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, color: C.sub, fontSize: 12 }}>총 {filtered.length}개 정책자금</div>

      {showCreate && (
        <CreateFundPanel onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
