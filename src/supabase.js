// Supabase 클라이언트 설정
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 환경변수 누락 조기 감지 — Vercel 빌드 시 VITE_ 변수가 누락되면 HTTP는 즉시 에러를 반환하지만
// WebSocket(Realtime)은 비동기로 조용히 실패해 CHANNEL_ERROR status + err=undefined 패턴으로 나타남
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[FUNDIT] Supabase 환경변수 누락.',
    '\n  VITE_SUPABASE_URL:', supabaseUrl ? supabaseUrl : '✗ undefined — 환경변수 없음',
    '\n  VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ (값 있음)' : '✗ undefined — 환경변수 없음',
    '\n  Vercel Dashboard > Settings > Environment Variables 에서',
    '\n  Production 스코프 포함 여부 확인 후 재배포 필요'
  )
} else {
  // 정상 케이스: URL과 key의 형식 유효성만 간단히 검증
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    console.warn('[FUNDIT] VITE_SUPABASE_URL 형식이 올바르지 않습니다:', supabaseUrl)
  }
  if (!supabaseAnonKey.startsWith('sb_') && !supabaseAnonKey.startsWith('eyJ')) {
    console.warn('[FUNDIT] VITE_SUPABASE_ANON_KEY 형식이 올바르지 않습니다 (sb_ 또는 eyJ 로 시작해야 함)')
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,   // JWT 만료 전 자동 갱신 — Realtime 연결 유지
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,    // Free Plan 제한 명시
    },
    log_level: 'info',        // WebSocket 연결/인증 과정 콘솔에 출력 (디버깅용)
  },
});

// Auth 관련 헬퍼 함수들
export const signUp = async (email, password, workspaceName, name) => {
  // 1. auth 사용자 먼저 생성 (user.id는 이메일 확인 여부와 무관하게 즉시 발급)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role: 'admin' } }
  });

  console.debug('signUp: auth.signUp response', { data, error });
  if (error) return { data: null, error };
  if (!data.user) return { data: null, error: new Error('회원가입 실패') };

  // 2. workspace + profile 원자적 생성
  //    create_workspace_and_profile은 security definer 함수이므로
  //    anon 상태(이메일 확인 미완료, 세션 없음)에서도 RLS/GRANT 제한 없이 실행됨.
  //    이메일 확인 비활성화 시에는 data.session이 있어 authenticated로 실행.
  // 새 워크스페이스 생성자는 항상 관리자(admin)
  // 향후 초대 가입 시에는 p_role: 'consultant' 전달
  const { data: workspaceId, error: rpcError } = await supabase.rpc('create_workspace_and_profile', {
    p_workspace_name: workspaceName || 'FUNDIT',
    p_user_id: data.user.id,
    p_name: name || email,
    p_email: email,
    p_role: 'admin',
  });

  if (rpcError) {
    console.error('create_workspace_and_profile error:', rpcError);
    return { data: null, error: rpcError };
  }

  console.debug('signUp 완료. workspace_id:', workspaceId);
  // data.session이 null이면 이메일 확인 대기 상태 — 호출부에서 안내 메시지 표시 필요
  return { data, error: null };
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  console.debug('signIn result', { data, error });
  if (error) return { data: null, error };
  return { data, error: null };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Supabase Auth 및 서버 에러 메시지를 한글로 변환합니다.
export const translateError = (error) => {
  if (!error) return null;
  const msg = error.message || String(error);

  if (msg.includes('User already registered') || msg.includes('already registered'))
    return '이미 가입된 이메일입니다.';
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('Email not confirmed'))
    return '이메일 인증이 필요합니다. 메일함을 확인해주세요.';
  if (msg.includes('Password should be at least') || msg.includes('password'))
    return '비밀번호는 6자 이상이어야 합니다.';
  if (msg.includes('Unable to validate email') || msg.includes('invalid format') || msg.includes('Email address is invalid'))
    return '유효하지 않은 이메일 형식입니다.';
  if (msg.includes('Signup requires a valid password'))
    return '비밀번호를 입력해주세요.';
  if (msg.includes('Too many requests') || msg.includes('rate limit') || msg.includes('over_email_send_rate_limit'))
    return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  if (msg.includes('Network') || msg.includes('fetch'))
    return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
  if (msg.includes('프로필을 찾을 수 없습니다'))
    return '계정 정보를 찾을 수 없습니다. 관리자에게 문의하세요.';
  if (msg.includes('Workspace create failed'))
    return '워크스페이스 생성에 실패했습니다.';

  // 이미 한글이면 그대로 반환
  if (/[가-힣]/.test(msg)) return msg;

  // 나머지 영어 에러는 원문 포함해서 반환
  return `오류가 발생했습니다: ${msg}`;
};

// ── 승인 관리 함수 ──────────────────────────────────────────────────────────────

// 슈퍼관리자 전용: 전체 workspace의 pending 프로필 조회
// is_superadmin() RLS bypass가 있어야 전체 테넌트 데이터 반환됨
// 일반 유저가 호출하면 자신의 workspace 범위만 반환되므로 정보 유출 없음
export const getPendingProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, workspace_id, created_at, workspace:workspaces(name)')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });
  return { data, error };
};

// admin 전용: 자신의 workspace 내 pending 프로필 조회
// get_my_workspace_id() RLS 조건이 자동으로 tenant 격리를 보장
export const getPendingConsultants = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, created_at')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true });
  return { data, error };
};

// approval_status를 'approved'로 변경
// RLS: is_superadmin() 또는 동일 workspace admin만 UPDATE 가능
export const approveProfile = async (profileId) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ approval_status: 'approved' })
    .eq('id', profileId)
    .select('id, name')
    .single();
  return { data, error };
};

// approval_status를 'rejected'로 변경
// RLS: is_superadmin() 또는 동일 workspace admin만 UPDATE 가능
export const rejectProfile = async (profileId) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ approval_status: 'rejected' })
    .eq('id', profileId)
    .select('id, name')
    .single();
  return { data, error };
};

// 기존 워크스페이스에 consultant로 합류 요청
// join_workspace_as_consultant RPC는 SECURITY DEFINER로 정의되어
// anon/authenticated 모두에서 호출 가능하며, approval_status='pending'으로 생성됩니다.
export const joinWorkspace = async (email, password, workspaceName, name) => {
  // 1. auth 사용자 생성
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role: 'consultant' } }
  });

  console.debug('joinWorkspace: auth.signUp response', { data, error });
  if (error) return { data: null, error };
  if (!data.user) return { data: null, error: new Error('회원가입 실패') };

  // 2. 기존 워크스페이스에 consultant로 합류 (approval_status='pending')
  const { data: profileId, error: rpcError } = await supabase.rpc('join_workspace_as_consultant', {
    p_workspace_name: workspaceName,
    p_user_id: data.user.id,
    p_name: name || email,
    p_email: email,
  });

  if (rpcError) {
    console.error('join_workspace_as_consultant error:', rpcError);
    return { data: null, error: rpcError };
  }

  console.debug('joinWorkspace 완료. profile_id:', profileId);
  return { data, error: null };
};

// 슈퍼관리자/관리자 전용: 대상 사용자 계정 삭제
// 권한 체크는 RPC 내부(delete_user)에서 수행:
//   - superadmin: 전체 삭제 가능
//   - admin: 같은 워크스페이스의 consultant만 삭제 가능
//   - 본인 삭제 방지, 타 워크스페이스 접근 차단
// auth.users 삭제 시 profiles는 ON DELETE CASCADE로 자동 삭제됨
export const deleteUser = async (targetUserId) => {
  const { error } = await supabase.rpc('delete_user', { target_user_id: targetUserId })
  return { error }
}

// 슈퍼관리자/관리자 전용: 대상 사용자 비밀번호 초기화
// 권한 체크는 RPC 내부(reset_user_password)에서 수행
export const resetUserPassword = async (targetUserId, tempPassword) => {
  const { error } = await supabase.rpc('reset_user_password', {
    p_target_user_id: targetUserId,
    p_new_password: tempPassword,
  })
  return { error }
}

// 비밀번호 변경 완료 후 must_change_password 플래그 초기화
// 본인 profile 업데이트 → 기존 workspace RLS로 허용됨
export const clearMustChangePassword = async (profileId) => {
  const { error } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', profileId)
  return { error }
}

// 슈퍼관리자 전용: 멤버 역할 변경 (admin ↔ consultant)
// is_superadmin() UPDATE RLS 정책이 모든 workspace의 profiles UPDATE를 허용
export const updateMemberRole = async (profileId, newRole) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', profileId)
    .select('id, role')
    .single()
  return { data, error }
}

// 슈퍼관리자 전용: 워크스페이스 완전 삭제 (cascade: profiles, customers, applications)
// is_superadmin() 체크는 RPC 내부에서 수행
export const deleteWorkspace = async (workspaceId) => {
  const { error } = await supabase.rpc('delete_workspace', { p_workspace_id: workspaceId })
  return { error }
}

// 슈퍼관리자 전용: 모든 워크스페이스 + 소속 멤버 조회
// is_superadmin() RLS bypass가 있어야 전체 테넌트 데이터 반환됨
export const getSAWorkspacesWithMembers = async () => {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, plan, created_at, members:profiles(id, name, email, role, approval_status, status, created_at)')
    .order('created_at', { ascending: false })
  return { data, error }
}

// workspace 내 approved 멤버 전체 조회
// RLS가 자동으로 같은 workspace_id 범위만 반환하므로 tenant 격리 보장
export const getWorkspaceMembers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, status, created_at')
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: true });
  return { data, error };
};

// 대시보드 통계: 고객사 수, 신청건 수, 진행중 건수, 최근 고객사, 신청건 상태별 수
// profile.role === 'consultant' 이면 본인(profile.id) 담당 건만, 그 외(admin)는 워크스페이스 전체
export const getDashboardStats = async (profile = null) => {
  try {
    const today = new Date()
    const isConsultant = profile?.role === 'consultant'
    const userId = profile?.id

    // 역할에 따라 필터 조건 분기 — 쿼리 빌더는 let으로 선언 후 조건부 체이닝
    let custCountQ  = supabase.from('customers').select('id', { count: 'exact', head: true })
    let appCountQ   = supabase.from('applications').select('id', { count: 'exact', head: true })
    let inProgQ     = supabase.from('applications')
      .select('id', { count: 'exact', head: true })
      .neq('status', '승인완료')
      .neq('status', '반려')
    let recentQ     = supabase.from('customers')
      .select('id, company, created_at, applications(status, deadline)')
      .order('created_at', { ascending: false })
      .limit(5)
    let appStatusQ  = supabase.from('applications').select('status')

    if (isConsultant && userId) {
      // consultant: 본인 담당 고객사/신청건만
      custCountQ = custCountQ.eq('consultant', userId)
      appCountQ  = appCountQ.eq('consultant', userId)
      inProgQ    = inProgQ.eq('consultant', userId)
      recentQ    = recentQ.eq('consultant', userId)   // 최근 배정된 내 고객사
      appStatusQ = appStatusQ.eq('consultant', userId)
    } else {
      // admin: 신규고객사 섹션 = status='신규' AND 미배정 고객사
      recentQ = recentQ.eq('status', '신규').is('consultant', null)
    }

    // admin 전용: 미배정 고객사 수 (consultant IS NULL)
    const allQueries = [custCountQ, appCountQ, inProgQ, recentQ, appStatusQ]
    if (!isConsultant) {
      allQueries.push(
        supabase.from('customers').select('id', { count: 'exact', head: true }).is('consultant', null)
      )
    }

    const [custRes, appRes, inProgRes, recentRes, appStatusRes, unassignedRes] = await Promise.all(allQueries)

    const statusCounts = {}
    ;(appStatusRes.data ?? []).forEach(({ status }) => {
      if (status) statusCounts[status] = (statusCounts[status] || 0) + 1
    })

    const recentCustomers = (recentRes.data ?? []).map(c => {
      const apps = (c.applications ?? [])
        .filter(a => a.deadline && a.status !== '반려')
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      const closest = apps[0]
      let dday = null
      const status = closest?.status ?? null
      if (closest?.deadline) {
        const diff = Math.ceil((new Date(closest.deadline) - today) / 86400000)
        dday = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
      }
      return { id: c.id, company: c.company, status, dday }
    })

    return {
      data: {
        customers: custRes.count ?? 0,
        applications: appRes.count ?? 0,
        inProgress: inProgRes.count ?? 0,
        unassignedCount: unassignedRes?.count ?? 0,   // admin 전용
        recentCustomers,
        statusCounts,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err }
  }
}

// 민감 정보를 제외한 안전한 고객사 컬럼 목록
// aippin_id/pw/2fa, sbiz_id/pw, resident_id_front 는 관리자 전용 (getCustomerSensitive 로 별도 조회)
const SAFE_CUSTOMER_COLS = [
  'id', 'workspace_id', 'company', 'ceo', 'industry', 'employees', 'revenue',
  'consultant', 'pool', 'tags', 'score', 'status', 'lead_source', 'phone',
  'business_type', 'business_reg_no', 'region', 'business_age',
  'received_date', 'birth_date', 'business_reg_date',
  'contract_amount', 'commission_rate', 'consultation_memo', 'quick_memo',
  'monthly_revenue', 'prev_year_revenue', 'prev2_year_revenue',
  'existing_loan', 'required_funds', 'kcb_score', 'nice_score',
  'tax_delinquent', 'overdue_history', 'rehabilitation', 'is_exporter',
  'smart_device', 'closure_history', 'employee_count', 'policy_fund_usage',
  'created_at',
].join(', ')

// workspace 내 고객사 페이지네이션 조회 (RLS로 tenant 격리, 민감 컬럼 제외)
// 정렬: 1차 received_date 내림차순 (null 후순위), 2차 created_at 내림차순
// 기존 호출부는 Customers.jsx에서 수정 필요 (인자 없는 호출 → 기본값 적용되나 count 반환 구조 달라짐)
export const getCustomers = async ({
  page = 1,
  pageSize = 50,
  status,       // '전체' 또는 undefined → 필터 안 함
  search,       // 문자열 → company/ceo/industry/phone ilike 검색
  consultantId  // uuid → 담당자 필터
} = {}) => {
  let query = supabase
    .from('customers')
    .select(SAFE_CUSTOMER_COLS, { count: 'exact' })
    .order('received_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status && status !== '전체') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `company.ilike.%${search}%,ceo.ilike.%${search}%,industry.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  if (consultantId) {
    query = query.eq('consultant', consultantId)
  }

  // pageSize = 0 이면 range 미적용 (CSV 내보내기용 전건 조회)
  if (pageSize > 0) {
    const from = (page - 1) * pageSize
    const to = page * pageSize - 1
    query = query.range(from, to)
  }

  const { data, count, error } = await query
  return { data, count, error }
}

// 고객사 삭제 (admin 전용 — 연관 applications cascade 삭제됨)
export const deleteCustomer = async (customerId) => {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
  return { error }
}

// 인증정보 민감 컬럼 조회 (aippin, sbiz, 주민번호)
// DB 레벨 역할 체크: admin/superadmin은 워크스페이스 전체, staff는 본인 담당 고객만 허용
// get_customer_sensitive RPC (supabase/add_customer_sensitive_read_rpc.sql) 참조
// 호출부에서 canViewAuth 확인 후 호출해야 하며 (CustomerDetailPanel.jsx),
// DB에서도 권한 위반 시 EXCEPTION을 발생시켜 이중으로 보호합니다.
export const getCustomerSensitive = async (customerId) => {
  const { data, error } = await supabase
    .rpc('get_customer_sensitive', { p_customer_id: customerId })
  // RPC는 배열을 반환하므로 단일 행으로 변환
  const row = Array.isArray(data) ? data[0] ?? null : data
  return { data: row, error }
}

// 고객사 신규 등록
export const createCustomer = async (customerData) => {
  const { data, error } = await supabase
    .from('customers')
    .insert(customerData)
    .select('*')
    .single()
  return { data, error }
}

// getProfile: auth.uid() 기반 RLS 정책이 적용된 상태에서 호출해야 합니다.
// signInWithPassword 또는 onAuthStateChange로 세션이 확립된 후 호출하세요.
// 내부에서 발생하는 모든 예외를 catch하여 {data: null, error} 형태로 반환합니다.
// approval_status 필드 포함: 'pending' | 'approved' | 'rejected'
export const getProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, workspace:workspaces(id, name)')
      .eq('id', userId)
      .single();

    if (error) {
      // PGRST116: 행 없음 (프로필 미생성 상태)
      if (error.code === 'PGRST116') {
        console.warn('getProfile: 프로필이 존재하지 않습니다. userId=', userId);
        return { data: null, error: new Error('프로필을 찾을 수 없습니다. 관리자에게 문의하세요.') };
      }
      console.error('getProfile error:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error('getProfile exception:', err);
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
};

// ── 알림(notifications) 함수 ──────────────────────────────────────────────────

// 알림 목록 조회 (본인 것만, 최신 20개)
export const getNotifications = async () => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  return { data, error }
}

// 알림 읽음 처리
export const markNotificationRead = async (id) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
  return { error }
}

// 전체 읽음 처리
export const markAllNotificationsRead = async () => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)
  return { error }
}

// 담당자 배분 알림 생성
export const createAssignmentNotification = async ({ workspaceId, userId, customerCompany, assignerName }) => {
  const { error } = await supabase
    .from('notifications')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      type: 'assignment',
      title: '담당 고객사 배정',
      body: `${assignerName}님이 "${customerCompany}" 고객사를 배정했습니다.`,
    })
  return { error }
}

// ── 신청건(applications) 함수 ──────────────────────────────────────────────────

// 신청건 전체 조회 (고객사·정책자금·담당자 join)
export const getApplications = async () => {
  const { data, error } = await supabase
    .from('applications')
    .select('*, customer:customers(id, company), fund:funds(id, name), consultant_profile:profiles!applications_consultant_fkey(id, name)')
    .order('created_at', { ascending: false })
  return { data, error }
}

// 신청건 등록
export const createApplication = async (payload) => {
  const { data, error } = await supabase
    .from('applications')
    .insert(payload)
    .select('*, customer:customers(id, company), fund:funds(id, name), consultant_profile:profiles!applications_consultant_fkey(id, name)')
    .single()
  return { data, error }
}

// 신청건 수정
export const updateApplication = async (id, patch) => {
  const { error } = await supabase
    .from('applications')
    .update(patch)
    .eq('id', id)
  return { error }
}

// 신청건 삭제
export const deleteApplication = async (id) => {
  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
  return { error }
}

// ── 정책자금(funds) 함수 ──────────────────────────────────────────────────────

// 정책자금 전체 조회 (마감일 오름차순)
export const getFunds = async () => {
  const { data, error } = await supabase
    .from('funds')
    .select('*')
    .order('deadline', { ascending: true })
  return { data, error }
}

// 정책자금 등록
export const createFund = async (payload) => {
  const { data, error } = await supabase
    .from('funds')
    .insert(payload)
    .select('*')
    .single()
  return { data, error }
}

// ── 일정(schedules) 함수 ─────────────────────────────────────────────────────

// 일정 전체 조회 (날짜 오름차순, 고객사 join)
export const getSchedules = async () => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*, customer:customers(id, company)')
    .order('date', { ascending: true })
  return { data, error }
}

// 일정 등록
export const createSchedule = async (payload) => {
  const { data, error } = await supabase
    .from('schedules')
    .insert(payload)
    .select('*, customer:customers(id, company)')
    .single()
  return { data, error }
}

// 일정 삭제
export const deleteSchedule = async (id) => {
  const { error } = await supabase.from('schedules').delete().eq('id', id)
  return { error }
}

// 일정 수정
export const updateSchedule = async (id, patch) => {
  const { data, error } = await supabase
    .from('schedules')
    .update(patch)
    .eq('id', id)
    .select('*, customer:customers(id, company)')
    .single()
  return { data, error }
}

// ── 통계(stats) 함수 ─────────────────────────────────────────────────────────

// 통계 데이터 집계 (월별 신청·승인, 상태 분포, KPI)
export const getStatsData = async () => {
  try {
    const today = new Date()
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

    const [customersRes, appsRes, approvedRes] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('applications').select('id, status, amount, created_at'),
      supabase.from('applications').select('id, amount').eq('status', '승인완료'),
    ])

    const apps = appsRes.data ?? []
    const approved = approvedRes.data ?? []

    // 월별 집계 (최근 6개월)
    const monthlyMap = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { month: `${d.getMonth() + 1}월`, applied: 0, approved: 0 }
    }
    apps.forEach(a => {
      const key = a.created_at?.slice(0, 7)
      if (monthlyMap[key]) {
        monthlyMap[key].applied++
        if (a.status === '승인완료') monthlyMap[key].approved++
      }
    })

    // 상태별 분포
    const statusCounts = {}
    apps.forEach(a => {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1
    })

    return {
      data: {
        totalCustomers: customersRes.count ?? 0,
        totalApps: apps.length,
        approvedCount: approved.length,
        approvalRate: apps.length ? Math.round((approved.length / apps.length) * 100) : 0,
        totalAmount: approved.reduce((sum, a) => sum + (a.amount || 0), 0),
        monthlyData: Object.values(monthlyMap),
        statusCounts,
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err }
  }
}

// 담당자별 성과 집계
export const getConsultantStats = async () => {
  try {
    const [membersRes, appsRes, custRes] = await Promise.all([
      supabase.from('profiles').select('id, name').eq('approval_status', 'approved'),
      supabase.from('applications').select('consultant, status, amount'),
      supabase.from('customers').select('id, consultant'),
    ])

    const members = membersRes.data ?? []
    const apps = appsRes.data ?? []
    const customers = custRes.data ?? []

    const stats = members.map(m => {
      const myApps = apps.filter(a => a.consultant === m.id)
      const myCustomers = customers.filter(c => c.consultant === m.id)
      const myApproved = myApps.filter(a => a.status === '승인완료')
      const myAmount = myApproved.reduce((sum, a) => sum + (a.amount || 0), 0)
      return {
        id: m.id,
        name: m.name,
        customers: myCustomers.length,
        applications: myApps.length,
        approvals: myApproved.length,
        amount: myAmount,
      }
    })

    return { data: stats, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}