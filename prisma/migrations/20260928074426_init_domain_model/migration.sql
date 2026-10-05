BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[sites] (
    [id] NVARCHAR(30) NOT NULL,
    [code] NVARCHAR(50) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [legacy_number] NVARCHAR(50),
    [portfolio] NVARCHAR(100),
    [occupying_bu] NVARCHAR(100),
    [bu_basin] NVARCHAR(100),
    [country] NVARCHAR(2) CONSTRAINT [sites_country_df] DEFAULT 'FR',
    [regional_director] NVARCHAR(150),
    [regional_technical_manager] NVARCHAR(150),
    [property_manager] NVARCHAR(150),
    [occupancy_status] NVARCHAR(100),
    [walls_owner] NVARCHAR(200),
    [sci_on_asset] NVARCHAR(200),
    [status] NVARCHAR(100),
    [is_active] BIT,
    [operating_mode] NVARCHAR(100),
    [logistics_operator] NVARCHAR(200),
    [address_line] NVARCHAR(300),
    [postal_code] NVARCHAR(10),
    [city] NVARCHAR(150),
    [department_code] NVARCHAR(3),
    [region] NVARCHAR(100),
    [latitude] DECIMAL(9,6),
    [longitude] DECIMAL(9,6),
    [coordinates_source] NVARCHAR(20),
    [distribution_sector] NVARCHAR(150),
    [typology] NVARCHAR(150),
    [target_activity] NVARCHAR(150),
    [stores_served_description] NVARCHAR(max),
    [stores_served_count] INT,
    [activity_start_date] DATE,
    [admin_file_reference] NVARCHAR(500),
    [version] INT NOT NULL CONSTRAINT [sites_version_df] DEFAULT 1,
    [archived_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [sites_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [sites_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sites_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[site_external_ids] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [system] NVARCHAR(20) NOT NULL,
    [value] NVARCHAR(100) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_external_ids_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_external_ids_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [site_external_ids_system_value_key] UNIQUE NONCLUSTERED ([system],[value]),
    CONSTRAINT [site_external_ids_site_id_system_key] UNIQUE NONCLUSTERED ([site_id],[system])
);

-- CreateTable
CREATE TABLE [dbo].[leases] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [code] NVARCHAR(50),
    [holding_entity] NVARCHAR(200),
    [initial_effective_date] DATE,
    [last_amendment_date] DATE,
    [end_date] DATE,
    [next_exit_date] DATE,
    [current_terms] NVARCHAR(max),
    [initial_rent_free] NVARCHAR(500),
    [document_reference] NVARCHAR(500),
    [notice_period_months] INT,
    [notice_period_raw] NVARCHAR(200),
    [notice_date] DATE,
    [negotiation_progress] NVARCHAR(max),
    [news] NVARCHAR(max),
    [renewal_conditions_signed] BIT,
    [rent_free_amount] DECIMAL(14,2),
    [rent_free_months] DECIMAL(6,2),
    [additional_duration] NVARCHAR(200),
    [economic_rent_per_sqm] DECIMAL(14,2),
    [market_rent_value] DECIMAL(14,2),
    [office_price_per_sqm] DECIMAL(14,2),
    [indexation] NVARCHAR(500),
    [rent_review] NVARCHAR(500),
    [rent_comments] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [leases_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [leases_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [leases_site_id_key] UNIQUE NONCLUSTERED ([site_id])
);

-- CreateTable
CREATE TABLE [dbo].[service_contracts] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [effective_date] DATE,
    [has_real_estate_clause] BIT,
    [duration_raw] NVARCHAR(200),
    [end_date] DATE,
    [renewal] NVARCHAR(500),
    [notice] NVARCHAR(500),
    [seniority] NVARCHAR(200),
    [first_termination_date] DATE,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [service_contracts_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [service_contracts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [service_contracts_site_id_key] UNIQUE NONCLUSTERED ([site_id])
);

-- CreateTable
CREATE TABLE [dbo].[site_technicals] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [building_quality] NVARCHAR(100),
    [height_m] DECIMAL(6,2),
    [lease_warehouse_area] DECIMAL(12,2),
    [land_area] DECIMAL(12,2),
    [total_warehouse_area] DECIMAL(12,2),
    [surveyed_total_area] DECIMAL(12,2),
    [temperature_controlled_area] DECIMAL(12,2),
    [dry_area] DECIMAL(12,2),
    [packaging_area] DECIMAL(12,2),
    [charging_room_area] DECIMAL(12,2),
    [technical_rooms_area] DECIMAL(12,2),
    [social_office_area] DECIMAL(12,2),
    [guard_house_area] DECIMAL(12,2),
    [car_spaces] INT,
    [truck_spaces] INT,
    [dock_count] INT,
    [cell_count] INT,
    [retention_basin] NVARCHAR(500),
    [extension_capacity] NVARCHAR(500),
    [technical_specifics] NVARCHAR(max),
    [certification] NVARCHAR(200),
    [ev_charging] NVARCHAR(200),
    [photovoltaic] NVARCHAR(200),
    [plans_reference] NVARCHAR(500),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_technicals_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_technicals_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [site_technicals_site_id_key] UNIQUE NONCLUSTERED ([site_id])
);

-- CreateTable
CREATE TABLE [dbo].[building_works] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [kind] NVARCHAR(20) NOT NULL,
    [date] DATE,
    [description] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [building_works_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [building_works_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[site_icpes] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [holder] NVARCHAR(200),
    [headings_raw] NVARCHAR(max),
    [georisques_url] NVARCHAR(1000),
    [documents_reference] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_icpes_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_icpes_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [site_icpes_site_id_key] UNIQUE NONCLUSTERED ([site_id])
);

-- CreateTable
CREATE TABLE [dbo].[icpe_headings] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [code] NVARCHAR(20) NOT NULL,
    [regime] NVARCHAR(10),
    [label] NVARCHAR(500),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [icpe_headings_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [icpe_headings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[site_energy_profiles] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [reference_year] INT,
    [reference_electricity_kwh] DECIMAL(18,4),
    [reference_gas_kwh] DECIMAL(18,4),
    [operat_certificates] NVARCHAR(1000),
    [technical_management_rebilled] BIT,
    [technical_management_rebill_detail] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_energy_profiles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_energy_profiles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [site_energy_profiles_site_id_key] UNIQUE NONCLUSTERED ([site_id])
);

-- CreateTable
CREATE TABLE [dbo].[annual_metrics] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [year] INT NOT NULL,
    [metric] NVARCHAR(40) NOT NULL,
    [value] DECIMAL(18,4),
    [source] NVARCHAR(20) NOT NULL CONSTRAINT [annual_metrics_source_df] DEFAULT 'import',
    [note] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [annual_metrics_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [annual_metrics_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [annual_metrics_site_id_year_metric_key] UNIQUE NONCLUSTERED ([site_id],[year],[metric])
);

-- CreateTable
CREATE TABLE [dbo].[site_geometries] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [footprint_geojson] NVARCHAR(max),
    [source] NVARCHAR(20),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_geometries_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_geometries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [site_geometries_site_id_key] UNIQUE NONCLUSTERED ([site_id])
);

-- CreateTable
CREATE TABLE [dbo].[site_plans] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [document_id] NVARCHAR(30),
    [image_width] INT,
    [image_height] INT,
    [control_points_json] NVARCHAR(max),
    [transform_json] NVARCHAR(max),
    [calibrated_at] DATETIME2,
    [calibrated_by_id] NVARCHAR(30),
    [is_current] BIT NOT NULL CONSTRAINT [site_plans_is_current_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [site_plans_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [site_plans_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[equipments] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [plan_id] NVARCHAR(30),
    [type] NVARCHAR(40) NOT NULL,
    [label] NVARCHAR(200),
    [reference] NVARCHAR(100),
    [plan_x] DECIMAL(12,4),
    [plan_y] DECIMAL(12,4),
    [latitude] DECIMAL(9,6),
    [longitude] DECIMAL(9,6),
    [level] NVARCHAR(50),
    [installed_at] DATE,
    [notes] NVARCHAR(max),
    [archived_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [equipments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [equipments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[documents] (
    [id] NVARCHAR(30) NOT NULL,
    [site_id] NVARCHAR(30) NOT NULL,
    [category] NVARCHAR(30) NOT NULL,
    [title] NVARCHAR(300),
    [storage_path] NVARCHAR(1000) NOT NULL,
    [mime_type] NVARCHAR(150),
    [size_bytes] BIGINT,
    [sha256] CHAR(64),
    [uploaded_by_id] NVARCHAR(30),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [documents_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [documents_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(30) NOT NULL,
    [email] NVARCHAR(254) NOT NULL,
    [name] NVARCHAR(150),
    [role] NVARCHAR(20) NOT NULL CONSTRAINT [users_role_df] DEFAULT 'viewer',
    [password_hash] NVARCHAR(255),
    [is_active] BIT NOT NULL CONSTRAINT [users_is_active_df] DEFAULT 1,
    [failed_login_count] INT NOT NULL CONSTRAINT [users_failed_login_count_df] DEFAULT 0,
    [locked_until] DATETIME2,
    [last_login_at] DATETIME2,
    [password_changed_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [occurred_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_occurred_at_df] DEFAULT CURRENT_TIMESTAMP,
    [actor_id] NVARCHAR(30),
    [action] NVARCHAR(20) NOT NULL,
    [source] NVARCHAR(20) NOT NULL,
    [entity_type] NVARCHAR(50) NOT NULL,
    [entity_id] NVARCHAR(50) NOT NULL,
    [site_id] NVARCHAR(30),
    [field] NVARCHAR(100),
    [before_value] NVARCHAR(max),
    [after_value] NVARCHAR(max),
    [batch_id] NVARCHAR(30),
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[import_batches] (
    [id] NVARCHAR(30) NOT NULL,
    [kind] NVARCHAR(20) NOT NULL,
    [file_name] NVARCHAR(300),
    [sha256] CHAR(64),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [import_batches_status_df] DEFAULT 'RUNNING',
    [started_at] DATETIME2 NOT NULL CONSTRAINT [import_batches_started_at_df] DEFAULT CURRENT_TIMESTAMP,
    [finished_at] DATETIME2,
    [stats_json] NVARCHAR(max),
    [report_path] NVARCHAR(1000),
    [actor_id] NVARCHAR(30),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [import_batches_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [import_batches_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sites_region_idx] ON [dbo].[sites]([region]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sites_department_code_idx] ON [dbo].[sites]([department_code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sites_portfolio_idx] ON [dbo].[sites]([portfolio]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sites_is_active_idx] ON [dbo].[sites]([is_active]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [leases_code_key] ON [dbo].[leases]([code]) WHERE ([code] IS NOT NULL);

-- CreateIndex
CREATE NONCLUSTERED INDEX [building_works_site_id_kind_idx] ON [dbo].[building_works]([site_id], [kind]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [icpe_headings_site_id_idx] ON [dbo].[icpe_headings]([site_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [icpe_headings_code_idx] ON [dbo].[icpe_headings]([code]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [annual_metrics_metric_year_idx] ON [dbo].[annual_metrics]([metric], [year]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [site_plans_site_id_idx] ON [dbo].[site_plans]([site_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [site_plans_document_id_idx] ON [dbo].[site_plans]([document_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [equipments_site_id_type_idx] ON [dbo].[equipments]([site_id], [type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [equipments_plan_id_idx] ON [dbo].[equipments]([plan_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [documents_site_id_category_idx] ON [dbo].[documents]([site_id], [category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [documents_sha256_idx] ON [dbo].[documents]([sha256]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_entity_type_entity_id_idx] ON [dbo].[audit_logs]([entity_type], [entity_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_site_id_idx] ON [dbo].[audit_logs]([site_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_occurred_at_idx] ON [dbo].[audit_logs]([occurred_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_batch_id_idx] ON [dbo].[audit_logs]([batch_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [import_batches_started_at_idx] ON [dbo].[import_batches]([started_at]);

-- AddForeignKey
ALTER TABLE [dbo].[site_external_ids] ADD CONSTRAINT [site_external_ids_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[leases] ADD CONSTRAINT [leases_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[service_contracts] ADD CONSTRAINT [service_contracts_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[site_technicals] ADD CONSTRAINT [site_technicals_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[building_works] ADD CONSTRAINT [building_works_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[site_icpes] ADD CONSTRAINT [site_icpes_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[icpe_headings] ADD CONSTRAINT [icpe_headings_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[site_energy_profiles] ADD CONSTRAINT [site_energy_profiles_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[annual_metrics] ADD CONSTRAINT [annual_metrics_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[site_geometries] ADD CONSTRAINT [site_geometries_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[site_plans] ADD CONSTRAINT [site_plans_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[site_plans] ADD CONSTRAINT [site_plans_document_id_fkey] FOREIGN KEY ([document_id]) REFERENCES [dbo].[documents]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[site_plans] ADD CONSTRAINT [site_plans_calibrated_by_id_fkey] FOREIGN KEY ([calibrated_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[equipments] ADD CONSTRAINT [equipments_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[equipments] ADD CONSTRAINT [equipments_plan_id_fkey] FOREIGN KEY ([plan_id]) REFERENCES [dbo].[site_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[documents] ADD CONSTRAINT [documents_site_id_fkey] FOREIGN KEY ([site_id]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[documents] ADD CONSTRAINT [documents_uploaded_by_id_fkey] FOREIGN KEY ([uploaded_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[import_batches] ADD CONSTRAINT [import_batches_actor_id_fkey] FOREIGN KEY ([actor_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddCheckConstraint (hand-written: Prisma cannot express CHECK constraints).
-- Only these four lists are enforced by the database; every other list of
-- values is validated by zod in src/domain/enums.ts. Keep both in sync.
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_role_check] CHECK ([role] IN (N'admin', N'editor', N'viewer'));

-- AddCheckConstraint
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_action_check] CHECK ([action] IN (N'CREATE', N'UPDATE', N'DELETE', N'IMPORT', N'ENRICH', N'LOGIN', N'LOGIN_FAILED', N'LOGOUT'));

-- AddCheckConstraint
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_source_check] CHECK ([source] IN (N'ui', N'import', N'enrichment', N'system'));

-- AddCheckConstraint
ALTER TABLE [dbo].[annual_metrics] ADD CONSTRAINT [annual_metrics_source_check] CHECK ([source] IN (N'import', N'manual', N'enrichment'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
