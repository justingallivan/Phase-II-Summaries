-- Migration 008: IRS exempt-organizations reference data (BMF extract)
--
-- Stores the IRS Exempt Organizations Business Master File extract
-- (four regional CSVs, ~1.95M rows total). Used by /api/irs/verify-ein
-- to answer "is this EIN currently 501(c)(3) exempt?" for PowerAutomate
-- on Dynamics field flips.
--
-- See:
--   docs/atlas/postgres-irs-exempt-orgs.md
--   memory: project_irs_exempt_verification.md
--
-- This is REFERENCE DATA, not materials-of-record. The bulk extract stays
-- in Postgres; verified results are written back to Dynamics `account`
-- rows by PowerAutomate (not by this app).
--
-- Refresh contract: quarterly via /api/cron/refresh-irs-bmf (atomic swap
-- of the whole table). When the SoCal program (smaller, less-stable orgs)
-- comes online, consider bumping refresh cadence to monthly.

CREATE TABLE IF NOT EXISTS irs_exempt_orgs (
  ein              VARCHAR(9)  PRIMARY KEY,    -- 9 digits, no dash, IRS EIN format
  name             TEXT NOT NULL,              -- primary org name
  ico              TEXT,                       -- "In Care Of"
  street           TEXT,
  city             TEXT,
  state            VARCHAR(2),                 -- nullable: international rows (region 4)
  zip              VARCHAR(10),
  group_exemption  VARCHAR(4),                 -- "GROUP" — 4-digit group exemption number
  subsection       VARCHAR(2) NOT NULL,        -- "SUBSECTION" — '03' is 501(c)(3)
  affiliation      VARCHAR(1),                 -- "AFFILIATION" — 1/2/3/6/7/8/9
  classification   VARCHAR(4),                 -- "CLASSIFICATION" — 1–4 codes
  ruling_date      VARCHAR(6),                 -- "RULING" — YYYYMM, string per IRS
  deductibility    VARCHAR(1),                 -- '1'=deductible, '2'=not, '4'=by treaty
  foundation       VARCHAR(2),                 -- foundation type code
  organization     VARCHAR(1),                 -- 1=Corp, 2=Trust, 3=Co-op, 4=Partnership, 5=Assoc
  status           VARCHAR(2) NOT NULL,        -- '01'=Unconditional, '02'=Conditional, '12'/'25'=special
  ntee_cd          VARCHAR(4),                 -- NTEE classification code
  sort_name        TEXT,                       -- secondary/DBA name
  region           VARCHAR(1) NOT NULL,        -- '1'..'4', source file
  refresh_date     DATE NOT NULL               -- date of the most recent import run
);

-- Most-recently-updated indexes the refresh script + the verify endpoint use.
CREATE INDEX IF NOT EXISTS idx_irs_exempt_orgs_state
  ON irs_exempt_orgs(state) WHERE state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_irs_exempt_orgs_subsection_status
  ON irs_exempt_orgs(subsection, status);

COMMENT ON TABLE irs_exempt_orgs IS
  'IRS BMF reference data. Atomic-swap refresh quarterly via /api/cron/refresh-irs-bmf. Not Wave 2 migrate-eligible — durable Postgres reference data.';
COMMENT ON COLUMN irs_exempt_orgs.status IS
  'IRS Exempt Org Status Code. ''01''=Unconditional Exemption, ''02''=Conditional Exemption, ''12''=4947(a)(2) trust, ''25''=terminating PF. Codes other than 01/02 are non-active or special cases.';
COMMENT ON COLUMN irs_exempt_orgs.subsection IS
  'IRS Subsection Code (501(c)(N)). ''03'' is the 501(c)(3) charitable/educational/scientific etc. bucket. Most grant recipients fall here.';
COMMENT ON COLUMN irs_exempt_orgs.deductibility IS
  'IRS Deductibility Code. ''1''=deductible, ''2''=not deductible, ''4''=deductible by treaty (foreign orgs).';
