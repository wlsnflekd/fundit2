import { useState, useEffect, useRef } from 'react'
import { useT } from '../../theme.jsx'
import { getCustomerDocuments, upsertCustomerDocument } from '../../supabase.js'
import { getDocTypes } from './documentTypes.js'

// ─── 서류정보 탭 — 사업자형태별 서류 체크리스트 (customer_documents, 0010) ──────
// - 행이 없는 서류는 '미요청'으로 표시, 처음 바꿀 때 (customer_id, doc_type) upsert 로 생성
// - 상태 버튼: 클릭 즉시 저장 / 메모: 1초 debounce + blur 즉시 저장 / 언마운트(탭·고객 전환) 시 대기분 저장
// - 개인↔법인 형태가 바뀌어도 기존 기록은 유지 (해당 형태의 목록만 표시)
// - 파일 첨부는 후속 (customer_document_files 별도 테이블 예정)

const NOTE_DEBOUNCE_MS = 1000
const EMPTY_DOC = { status: '미요청', received_at: null, note: null }

// 로컬 날짜 YYYY-MM-DD (toISOString 은 UTC 라 KST 오전 9시 전엔 전날이 됨)
function todayLocal() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function StatusButtons({ value, onChange }) {
  const C = useT()
  const OPTIONS = [
    { v: '미요청',   color: C.sub },
    { v: '요청함',   color: C.blue },
    { v: '수령',     color: C.green },
    { v: '보완필요', color: C.error },
  ]
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {OPTIONS.map(({ v, color }) => {
        const isActive = value === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => { if (!isActive) onChange(v) }}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 8,
              border: `1px solid ${isActive ? color : C.line}`,
              background: isActive ? `${color}22` : C.s3,
              color: isActive ? color : C.sub,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

// onDocsChange(map): 로드·변경 시 부모(탭 작성 상태 점등)에 최신 서류 상태 전달
export default function TabDocuments({ customerId, businessType, isMobile, onDocsChange }) {
  const C = useT()
  const [docs, setDocs] = useState({})          // doc_type → { status, received_at, note }
  const [loadState, setLoadState] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  // 저장 상태 표시용 — 라벨은 이 값들로 계산 (여러 서류가 동시에 저장·대기 중이어도 정확)
  const [pendingCount, setPendingCount] = useState(0)  // 메모 debounce 대기 중인 서류 수
  const [inFlight, setInFlight] = useState(0)          // 진행 중인 저장 요청 수
  const [lastError, setLastError] = useState(null)     // { docType, message } — 해당 서류가 다시 저장 성공하면 해제
  const [everSaved, setEverSaved] = useState(false)

  const docsRef = useRef({})
  const pendingNoteRef = useRef(new Set())   // 메모 저장 대기 중인 doc_type
  const noteTimerRef = useRef(null)
  // 서류별 저장 직렬화 — 이전 요청이 끝난 뒤 그 시점의 최신 값을 보냄 (늦게 도착한 옛 요청이 덮어쓰는 것 방지)
  const saveChainRef = useRef(new Map())
  // 콜백은 ref 로 보관 — 부모가 매 렌더 새 함수를 넘겨도 로드 effect 가 다시 돌지 않음
  const onDocsChangeRef = useRef(onDocsChange)
  useEffect(() => { onDocsChangeRef.current = onDocsChange }, [onDocsChange])

  const docTypes = getDocTypes(businessType)

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: `1px solid ${C.line}`, background: C.s3, color: C.text,
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }

  // 로드 — 부모가 key={customerId} 로 렌더하므로 고객 전환 시 새로 마운트됨
  useEffect(() => {
    let cancelled = false
    getCustomerDocuments(customerId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error.code === '42P01' || error.code === 'PGRST205'
          ? '서류 테이블이 DB에 없습니다. (0010 마이그레이션 실행 필요)'
          : `서류 정보를 불러올 수 없습니다. (${error.message})`)
        setLoadState('error')
        return
      }
      const map = {}
      ;(data ?? []).forEach(r => {
        map[r.doc_type] = { status: r.status, received_at: r.received_at, note: r.note }
      })
      docsRef.current = map
      setDocs(map)
      setLoadState('ready')
      onDocsChangeRef.current?.(map)
    })
    return () => { cancelled = true }
  }, [customerId])

  const save = (docType) => {
    setInFlight(n => n + 1)
    const prev = saveChainRef.current.get(docType) ?? Promise.resolve()
    const next = prev.then(async () => {
      const doc = docsRef.current[docType] ?? EMPTY_DOC
      const { error } = await upsertCustomerDocument(customerId, docType, doc)
      if (error) {
        setLastError({ docType, message: `'${docType}' 저장 실패: ${error.message}` })
      } else {
        setLastError(e => (e?.docType === docType ? null : e))
        setEverSaved(true)
      }
    }).finally(() => setInFlight(n => n - 1))
    saveChainRef.current.set(docType, next)
  }

  const flushNotes = () => {
    if (noteTimerRef.current) { clearTimeout(noteTimerRef.current); noteTimerRef.current = null }
    const pending = [...pendingNoteRef.current]
    pendingNoteRef.current = new Set()
    setPendingCount(0)
    pending.forEach(t => { save(t) })
  }

  // 언마운트(탭 전환·고객 전환·패널 닫기) 시 대기 중인 메모 저장
  useEffect(() => () => flushNotes(), []) // eslint-disable-line react-hooks/exhaustive-deps -- ref 만 사용

  const updateDoc = (docType, patch) => {
    const next = { ...(docsRef.current[docType] ?? EMPTY_DOC), ...patch }
    docsRef.current = { ...docsRef.current, [docType]: next }
    setDocs(docsRef.current)
    onDocsChangeRef.current?.(docsRef.current)
    return next
  }

  const changeStatus = (docType, status) => {
    const cur = docsRef.current[docType] ?? EMPTY_DOC
    // 수령 → 오늘 날짜 자동 입력(이미 있으면 유지), 그 외 상태 → 수령일 비움
    const received_at = status === '수령' ? (cur.received_at || todayLocal()) : null
    updateDoc(docType, { status, received_at })
    // 같은 서류의 메모 대기분도 이번 저장에 함께 실림 (전체 행 상태를 보내므로)
    pendingNoteRef.current.delete(docType)
    setPendingCount(pendingNoteRef.current.size)
    save(docType)
  }

  const changeReceivedAt = (docType, value) => {
    updateDoc(docType, { received_at: value || null })
    pendingNoteRef.current.delete(docType)
    setPendingCount(pendingNoteRef.current.size)
    save(docType)
  }

  const changeNote = (docType, value) => {
    updateDoc(docType, { note: value === '' ? null : value })
    pendingNoteRef.current.add(docType)
    setPendingCount(pendingNoteRef.current.size)
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(flushNotes, NOTE_DEBOUNCE_MS)
  }

  // ── 렌더 ─────────────────────────────────────────────────────────
  if (!docTypes) {
    return (
      <div style={{
        padding: '28px 16px', textAlign: 'center', borderRadius: 10,
        border: `1px dashed ${C.line}`, color: C.sub, fontSize: 13, lineHeight: 1.7,
      }}>
        기본정보에서 사업자형태를 먼저 선택하세요
        <div style={{ fontSize: 12, marginTop: 4 }}>(개인사업자 / 법인사업자에 따라 서류 목록이 달라집니다)</div>
      </div>
    )
  }

  if (loadState === 'loading') {
    return <div style={{ color: C.sub, fontSize: 13, padding: '12px 0' }}>서류 정보를 불러오는 중...</div>
  }
  if (loadState === 'error') {
    return <div style={{ color: C.error, fontSize: 13, padding: '12px 0' }}>{loadError}</div>
  }

  const receivedCount = docTypes.filter(t => docs[t]?.status === '수령').length
  const pct = Math.round((receivedCount / docTypes.length) * 100)

  const saveLabel = lastError ? { text: lastError.message, color: C.error }
    : pendingCount > 0 ? { text: '저장 대기 중...', color: C.gold }
    : inFlight > 0 ? { text: '저장 중...', color: C.sub }
    : everSaved ? { text: '저장됨', color: C.green }
    : null

  return (
    <div>
      {/* 진행률 */}
      <div style={{
        padding: '12px 14px', borderRadius: 10, background: C.s1,
        border: `1px solid ${C.line}`, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
            수령 <span style={{ color: C.green }}>{receivedCount}</span> / 전체 {docTypes.length}
          </span>
          <span style={{ fontSize: 11, color: C.sub }}>{businessType}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.s3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: C.green, transition: 'width 0.2s' }} />
        </div>
        {saveLabel && (
          <div style={{ fontSize: 12, color: saveLabel.color, marginTop: 8 }}>{saveLabel.text}</div>
        )}
      </div>

      {/* 서류 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {docTypes.map((docType, i) => {
          const doc = docs[docType] ?? EMPTY_DOC
          const isReceived = doc.status === '수령'
          return (
            <div key={docType} style={{
              padding: '12px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${C.line}`,
            }}>
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: isMobile ? 8 : 12,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: C.text,
                  width: isMobile ? 'auto' : 150, flexShrink: 0,
                }}>
                  {docType}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StatusButtons value={doc.status} onChange={v => changeStatus(docType, v)} />
                </div>
              </div>

              <div style={{
                display: 'flex', gap: 8, marginTop: 8,
                flexDirection: isMobile && isReceived ? 'column' : 'row',
              }}>
                {isReceived && (
                  <input
                    type="date"
                    style={{ ...inputStyle, width: isMobile ? '100%' : 150, flexShrink: 0 }}
                    value={doc.received_at ?? ''}
                    onChange={e => changeReceivedAt(docType, e.target.value)}
                    min="1900-01-01" max="2099-12-31"
                    title="수령일"
                  />
                )}
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  value={doc.note ?? ''}
                  maxLength={500}
                  onChange={e => changeNote(docType, e.target.value)}
                  onBlur={() => { if (pendingNoteRef.current.has(docType)) flushNotes() }}
                  placeholder={doc.status === '보완필요' ? '보완 사유' : '메모'}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
