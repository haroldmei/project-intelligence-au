-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mobile_e164" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "trade" TEXT NOT NULL DEFAULT 'roofing',
    "subscription_status" TEXT NOT NULL DEFAULT 'trial',
    "access_until" TIMESTAMP(3),
    "stripe_customer_id" TEXT,
    "saved_query_text" TEXT,
    "saved_query_embedding" vector(1536),
    "personalisation_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_otps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "purpose" TEXT NOT NULL DEFAULT 'verify',

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "posthog_consent" BOOLEAN NOT NULL DEFAULT false,
    "consented_at" TIMESTAMP(3),

    CONSTRAINT "user_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lga_bundles" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "lga_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgas" (
    "id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "lgas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lga_bundle_subscriptions" (
    "user_id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,

    CONSTRAINT "lga_bundle_subscriptions_pkey" PRIMARY KEY ("user_id","bundle_id")
);

-- CreateTable
CREATE TABLE "development_applications" (
    "id" TEXT NOT NULL,
    "da_id" TEXT NOT NULL,
    "council" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimated_value" DECIMAL(65,30),
    "lodgement_date" DATE NOT NULL,
    "applicant_name" TEXT,
    "portal_url" TEXT NOT NULL,
    "raw_scope_text" TEXT,
    "source_api" TEXT NOT NULL,
    "rule_filtered_out" BOOLEAN NOT NULL DEFAULT false,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lga_id" TEXT,

    CONSTRAINT "development_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "da_embeddings" (
    "da_id" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "embedded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "da_embeddings_pkey" PRIMARY KEY ("da_id")
);

-- CreateTable
CREATE TABLE "da_ground_truth" (
    "id" TEXT NOT NULL,
    "da_id" TEXT NOT NULL,
    "council" TEXT NOT NULL,
    "is_relevant" BOOLEAN NOT NULL,
    "labelled_by" TEXT NOT NULL,
    "labelled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "da_ground_truth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_runs" (
    "id" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "user_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "digest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "da_count" INTEGER NOT NULL DEFAULT 0,
    "email_status" TEXT,
    "sms_status" TEXT,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_das" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "da_id" TEXT NOT NULL,
    "relevance_score" INTEGER NOT NULL,
    "why_matched" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "digest_das_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "da_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "da_id" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'portal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "da_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_cost_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_aud" DECIMAL(65,30) NOT NULL,
    "week_start" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cost_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_log" (
    "id" TEXT NOT NULL,
    "council" TEXT NOT NULL,
    "source_api" TEXT NOT NULL,
    "da_count" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,

    CONSTRAINT "ingestion_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_accounts" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'solo',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'seat',

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_urls" (
    "slug" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_urls_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "raw_da" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "lga_slug" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_da_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_candidate" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "digest_id" TEXT,
    "raw_da_id" TEXT NOT NULL,
    "relevance" INTEGER NOT NULL,
    "why_matched" TEXT NOT NULL,
    "prefilter_score" DOUBLE PRECISION NOT NULL,
    "vector_score" DOUBLE PRECISION,
    "llm_model" TEXT NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "window" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "email_otps_user_id_idx" ON "email_otps"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_consent_user_id_key" ON "user_consent"("user_id");

-- CreateIndex
CREATE INDEX "development_applications_council_lodgement_date_idx" ON "development_applications"("council", "lodgement_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "development_applications_da_id_council_key" ON "development_applications"("da_id", "council");

-- CreateIndex
CREATE INDEX "digests_user_id_idx" ON "digests"("user_id");

-- CreateIndex
CREATE INDEX "da_feedback_user_id_created_at_idx" ON "da_feedback"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "da_feedback_user_id_da_id_key" ON "da_feedback"("user_id", "da_id");

-- CreateIndex
CREATE INDEX "ai_cost_log_user_id_week_start_idx" ON "ai_cost_log"("user_id", "week_start");

-- CreateIndex
CREATE INDEX "ingestion_log_council_run_at_idx" ON "ingestion_log"("council", "run_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "team_accounts_owner_user_id_key" ON "team_accounts"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_team_id_user_id_key" ON "team_memberships"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "raw_da_processed_fetched_at_idx" ON "raw_da"("processed", "fetched_at");

-- CreateIndex
CREATE INDEX "raw_da_lga_slug_fetched_at_idx" ON "raw_da"("lga_slug", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "raw_da_source_source_record_id_key" ON "raw_da"("source", "source_record_id");

-- CreateIndex
CREATE INDEX "digest_candidate_user_id_digest_id_idx" ON "digest_candidate"("user_id", "digest_id");

-- CreateIndex
CREATE UNIQUE INDEX "digest_candidate_user_id_raw_da_id_key" ON "digest_candidate"("user_id", "raw_da_id");

-- CreateIndex
CREATE INDEX "rate_limit_window_idx" ON "rate_limit"("window");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_window_key" ON "rate_limit"("key", "window");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consent" ADD CONSTRAINT "user_consent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "lga_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lga_bundle_subscriptions" ADD CONSTRAINT "lga_bundle_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lga_bundle_subscriptions" ADD CONSTRAINT "lga_bundle_subscriptions_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "lga_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_applications" ADD CONSTRAINT "development_applications_lga_id_fkey" FOREIGN KEY ("lga_id") REFERENCES "lgas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "da_embeddings" ADD CONSTRAINT "da_embeddings_da_id_fkey" FOREIGN KEY ("da_id") REFERENCES "development_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "da_ground_truth" ADD CONSTRAINT "da_ground_truth_da_id_fkey" FOREIGN KEY ("da_id") REFERENCES "development_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digests" ADD CONSTRAINT "digests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digests" ADD CONSTRAINT "digests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "digest_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_das" ADD CONSTRAINT "digest_das_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_das" ADD CONSTRAINT "digest_das_da_id_fkey" FOREIGN KEY ("da_id") REFERENCES "development_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "da_feedback" ADD CONSTRAINT "da_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "da_feedback" ADD CONSTRAINT "da_feedback_da_id_fkey" FOREIGN KEY ("da_id") REFERENCES "development_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_cost_log" ADD CONSTRAINT "ai_cost_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_accounts" ADD CONSTRAINT "team_accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_candidate" ADD CONSTRAINT "digest_candidate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_candidate" ADD CONSTRAINT "digest_candidate_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "digests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_candidate" ADD CONSTRAINT "digest_candidate_raw_da_id_fkey" FOREIGN KEY ("raw_da_id") REFERENCES "raw_da"("id") ON DELETE CASCADE ON UPDATE CASCADE;

