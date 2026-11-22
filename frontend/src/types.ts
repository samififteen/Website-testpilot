export type TestStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'warnings'
  | 'cancelled'
  | 'error'

export type ResultStatus = 'passed' | 'failed' | 'warning' | 'skipped' | 'info'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface Counts {
  total: number
  passed: number
  failed: number
  warnings: number
  skipped: number
  info: number
}

export interface TestConfig {
  browser: 'chromium' | 'firefox' | 'webkit'
  max_depth: number
  max_pages: number
  max_links: number
  timeout_seconds: number
  check_links: boolean
  test_interactions: boolean
  test_forms: boolean
  capture_screenshots: boolean
  ai_analysis: boolean
}

export interface TestResultItem {
  id: string
  execution_id: string
  test_name: string
  category: string
  status: ResultStatus
  severity: Severity
  description: string
  url: string | null
  error_details: string | null
  duration_ms: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  screenshot_ids: string[]
}

export interface Screenshot {
  id: string
  execution_id: string
  test_result_id: string | null
  screenshot_type: string
  page_url: string | null
  size_bytes: number
  created_at: string
  view_url: string
  download_url: string
}

export interface ExecutionProgress {
  stage: string
  message: string
  current: number | null
  total: number | null
  updated_at: string
}

export interface TestExecution {
  id: string
  url: string
  name: string
  status: TestStatus
  config: Partial<TestConfig>
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  health_score: number | null
  page_title: string | null
  summary: Record<string, unknown>
  error_message: string | null
  created_at: string
  counts: Counts
  progress?: ExecutionProgress | null
}

export interface ExecutionDetail extends TestExecution {
  results: TestResultItem[]
  screenshots: Screenshot[]
  ai_analysis: Analysis
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface DashboardStats {
  total_tests: number
  passed_tests: number
  failed_tests: number
  warning_tests: number
  running_tests: number
  success_rate: number
  average_duration_ms: number
  average_health_score: number | null
  last_run_at: string | null
}

export interface ActivityPoint {
  date: string
  total: number
  passed: number
  failed: number
  warnings: number
}

export interface HealthSummary {
  health_score: number | null
  broken_links: number
  javascript_errors: number
  failed_requests: number
  form_validation_status: string
  explanation: string
  has_data: boolean
}

export interface DashboardData {
  stats: DashboardStats
  recent: TestExecution[]
  activity: ActivityPoint[]
  health: HealthSummary
}

export interface AnalysisFinding {
  title: string
  severity: Severity
  category: string
  description: string
  evidence: string
  url: string
  suggested_fix: string
}

export interface Analysis {
  mode: 'ai' | 'rule-based' | string
  provider: string
  model: string | null
  generated_at?: string | null
  executive_summary: string
  findings: AnalysisFinding[]
  recommendations: string[]
  risk_assessment: string
  developer_explanations: { issue: string; explanation: string }[]
  error?: string | null
}

export interface ReportResponse {
  execution: TestExecution
  results: TestResultItem[]
  screenshots: Screenshot[]
  analysis: Analysis
  health: HealthSummary
  generated_at: string
}

export interface SettingsPayload {
  default_timeout_seconds: number
  default_max_pages: number
  default_max_links: number
  default_max_depth: number
  max_concurrency: number
  default_browser: 'chromium' | 'firefox' | 'webkit'
  ai_enabled: boolean
  ai_provider: string
  ai_model: string
  capture_screenshots: boolean
  screenshot_storage: string
}

export interface SettingsResponse {
  settings: SettingsPayload
  ai_configured: boolean
  ai_key_source: string
  read_only_config: string[]
}

export interface SystemInfo {
  version: string
  backend_status: string
  database_status: string
  database_url_scheme: string
  browser_engine: string
  browser_version: string | null
  browser_installed: boolean
  executions_stored: number
  screenshots_stored: number
  ai_provider: string
  ai_configured: boolean
  ai_mode: string
  uptime_seconds: number
  allow_local_targets: boolean
  max_concurrency: number
}

export interface StreamSnapshot {
  status: TestStatus
  duration_ms: number | null
  health_score: number | null
  progress: ExecutionProgress | null
  counts: Counts
  results: Pick<
    TestResultItem,
    'id' | 'test_name' | 'category' | 'status' | 'severity' | 'description' | 'error_details' | 'url' | 'duration_ms'
  >[]
  terminal: boolean
}
