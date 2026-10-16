// 사업자형태별 제출 서류 목록 — 서류정보 탭과 탭 작성 상태 점등에서 공용
// DB CHECK(customer_documents_doc_type_check, 0010)는 두 목록의 합집합과 동일하게 유지
export const DOC_TYPES_BY_BUSINESS_TYPE = {
  개인사업자: [
    '사업자등록증', '부가세과세표준증명원', '재무제표', '소득금액증명원', '임대차계약서',
    '4대보험가입자명부', '대출금융거래확인서', '회사소개서', '특허 및 인증',
  ],
  법인사업자: [
    '사업자등록증', '부가세과세표준증명원', '재무제표', '법인등기부등본', '주주명부',
    '4대보험가입자명부', '대출금융거래확인서', '회사소개서', '특허 및 인증',
  ],
}

// 사업자형태가 표준값이 아니면 null
export function getDocTypes(businessType) {
  return DOC_TYPES_BY_BUSINESS_TYPE[businessType] ?? null
}

// 서류정보 작성 완료 — 표시되는 서류가 전부 '수령'. 사업자형태 미입력/서류 미로드 → false
// docs: doc_type → { status, … } (행이 없는 서류 = 미요청)
export function isDocumentsComplete(businessType, docs) {
  const types = getDocTypes(businessType)
  if (!types || !docs) return false
  return types.every(t => docs[t]?.status === '수령')
}
