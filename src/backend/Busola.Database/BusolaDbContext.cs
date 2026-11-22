using Busola.Database.Authorization;
using Busola.Database.Entities;
using Busola.Database.EvaluationTemplates;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Busola.Database;

public class BusolaDbContext(DbContextOptions<BusolaDbContext> options) : IdentityDbContext<User, Role, string>(options)
{
    public DbSet<Service> Services => Set<Service>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Absence> Absences => Set<Absence>();
    public DbSet<AbsenceReason> AbsenceReasons => Set<AbsenceReason>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserAvatar> UserAvatars => Set<UserAvatar>();
    public DbSet<EvaluationTemplate> EvaluationTemplates => Set<EvaluationTemplate>();
    public DbSet<Evaluation> Evaluations => Set<Evaluation>();
    public DbSet<EvaluationStage> EvaluationStages => Set<EvaluationStage>();
    public DbSet<EvaluationAnswer> EvaluationAnswers => Set<EvaluationAnswer>();
    public DbSet<EvaluationSignature> EvaluationSignatures => Set<EvaluationSignature>();
    public DbSet<SignatureRequest> SignatureRequests => Set<SignatureRequest>();
    public DbSet<EmployeeProfile> EmployeeProfiles => Set<EmployeeProfile>();
    public DbSet<EvaluationSelfAssessment> EvaluationSelfAssessments => Set<EvaluationSelfAssessment>();
    public DbSet<EvaluationReminder> EvaluationReminders => Set<EvaluationReminder>();
    public DbSet<EvaluationNote> EvaluationNotes => Set<EvaluationNote>();
    public DbSet<Position> Positions => Set<Position>();
    public DbSet<EvaluationIndicatorContext> EvaluationIndicatorContexts => Set<EvaluationIndicatorContext>();
    public DbSet<EvaluationCriterionContext> EvaluationCriterionContexts => Set<EvaluationCriterionContext>();
    public DbSet<EvaluationTermChange> EvaluationTermChanges => Set<EvaluationTermChange>();
    public DbSet<KnowledgeEmbedding> KnowledgeEmbeddings => Set<KnowledgeEmbedding>();

    // Tu, a nie w AddDbContext, żeby snake_case obowiązywał zawsze — schemat i aplikacja nie mogą się rozjechać.
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) =>
        optionsBuilder.UseSnakeCaseNamingConvention();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Identity ustawia nazwy AspNet* jawnie, więc konwencja snake_case ich nie łapie.
        modelBuilder.Entity<IdentityUserRole<string>>().ToTable("user_roles");
        modelBuilder.Entity<IdentityUserClaim<string>>().ToTable("user_claims");
        modelBuilder.Entity<IdentityUserLogin<string>>().ToTable("user_logins");
        modelBuilder.Entity<IdentityUserToken<string>>().ToTable("user_tokens");
        modelBuilder.Entity<IdentityRoleClaim<string>>().ToTable("role_claims");

        modelBuilder.Entity<User>(b =>
        {
            b.ToTable("users");

            // Jedno konto na pracownika; pracownika z kontem nie da się usunąć — najpierw konto.
            b.HasOne(u => u.Employee)
                .WithOne(e => e.User)
                .HasForeignKey<User>(u => u.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserAvatar>(b =>
        {
            b.HasKey(a => a.UserId);
            b.Property(a => a.ContentType).HasMaxLength(50);

            b.HasOne(a => a.User)
                .WithOne(u => u.Avatar)
                .HasForeignKey<UserAvatar>(a => a.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EvaluationTemplate>(b =>
        {
            // Seed ma Id 1..3, a Postgres nie przesuwa sekwencji przy jawnych Id — nowe wersje od 1000.
            b.Property(t => t.Id).UseIdentityByDefaultColumn().HasIdentityOptions(startValue: 1000);
            b.Property(t => t.Code).HasMaxLength(50);
            b.Property(t => t.Title).HasMaxLength(300);
            b.Property(t => t.Kind).HasConversion<string>().HasMaxLength(20);
            b.Property(t => t.Schema).HasColumnType("jsonb");
            b.HasIndex(t => new { t.Code, t.Version }).IsUnique();

            // Najwyżej jedna aktywna wersja na kod — według niej zakłada się nowe oceny.
            b.HasIndex(t => t.Code).IsUnique().HasFilter("is_active").HasDatabaseName("ix_evaluation_templates_active_code");
            b.HasData(EvaluationTemplateSeed.Templates);
        });

        modelBuilder.Entity<Evaluation>(b =>
        {
            b.Property(e => e.Status).HasMaxLength(50);

            b.HasOne(e => e.Employee)
                .WithMany()
                .HasForeignKey(e => e.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            b.HasOne(e => e.Evaluator)
                .WithMany()
                .HasForeignKey(e => e.EvaluatorId)
                .OnDelete(DeleteBehavior.Restrict);

            b.HasOne(e => e.Template)
                .WithMany()
                .HasForeignKey(e => e.TemplateId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EvaluationStage>(b =>
        {
            b.ToTable(t => t.HasCheckConstraint("ck_evaluation_stages_due_window", "due_from IS NULL OR due_to IS NULL OR due_from <= due_to"));
            b.Property(s => s.StageKey).HasMaxLength(50);
            b.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
            b.HasIndex(s => new { s.EvaluationId, s.StageKey }).IsUnique();

            // Pod listę „co się zbliża / co jest po terminie”.
            b.HasIndex(s => new { s.Status, s.DueTo });

            b.HasOne(s => s.Evaluation)
                .WithMany(e => e.Stages)
                .HasForeignKey(s => s.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);
            b.Property(s => s.DueNote).HasMaxLength(500);
        });

        modelBuilder.Entity<EvaluationTermChange>(b =>
        {
            b.Property(c => c.Kind).HasConversion<string>().HasMaxLength(30);
            b.Property(c => c.StageKey).HasMaxLength(50);
            b.Property(c => c.Reason).HasMaxLength(1000);
            b.Property(c => c.LegalRef).HasMaxLength(50);
            b.Property(c => c.ChangedByName).HasMaxLength(200);
            b.HasIndex(c => c.EvaluationId);

            b.HasOne(c => c.Evaluation)
                .WithMany()
                .HasForeignKey(c => c.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(c => c.ChangedBy)
                .WithMany()
                .HasForeignKey(c => c.ChangedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EvaluationAnswer>(b =>
        {
            b.ToTable(t =>
            {
                t.HasCheckConstraint("ck_evaluation_answers_has_value",
                    "value_text IS NOT NULL OR value_number IS NOT NULL OR value_date IS NOT NULL");
                t.HasCheckConstraint("ck_evaluation_answers_date_range",
                    "value_date_to IS NULL OR (value_date IS NOT NULL AND value_date <= value_date_to)");
            });

            b.Property(a => a.FieldKey).HasMaxLength(100);
            b.Property(a => a.ItemKey).HasMaxLength(100);
            b.Property(a => a.ValueNumber).HasPrecision(10, 4);

            // NULLS NOT DISTINCT: zwykłe pole (ItemKey = null) też ma tylko jedną wartość.
            b.HasIndex(a => new { a.EvaluationId, a.FieldKey, a.ItemKey }).IsUnique().AreNullsDistinct(false);

            b.HasOne(a => a.Evaluation)
                .WithMany(e => e.Answers)
                .HasForeignKey(a => a.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(a => a.UpdatedBy)
                .WithMany()
                .HasForeignKey(a => a.UpdatedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EvaluationSignature>(b =>
        {
            b.ToTable(t =>
            {
                // Obraz jest opcjonalny, ale jak jest, to w komplecie: treść, typ i hash.
                t.HasCheckConstraint("ck_evaluation_signatures_image_complete",
                    "(image_content IS NULL AND image_content_type IS NULL AND image_sha256 IS NULL)"
                    + " OR (image_content IS NOT NULL AND image_content_type IS NOT NULL AND image_sha256 IS NOT NULL)");
                t.HasCheckConstraint("ck_evaluation_signatures_image_content_type",
                    "image_content_type IN ('image/png', 'image/webp')");
                t.HasCheckConstraint("ck_evaluation_signatures_image_sha256", "octet_length(image_sha256) = 32");

                // Podpis to mały obraz; limit chroni przed przypadkowym wrzuceniem zdjęcia albo skanu.
                t.HasCheckConstraint("ck_evaluation_signatures_image_size", "octet_length(image_content) BETWEEN 1 AND 524288");
            });

            b.Property(s => s.FieldKey).HasMaxLength(100);
            b.Property(s => s.ImageContentType).HasMaxLength(50);
            b.Property(s => s.Role).HasConversion<string>().HasMaxLength(20);
            b.Property(s => s.SignerName).HasMaxLength(200);
            b.Property(s => s.Place).HasMaxLength(100);
            b.HasIndex(s => new { s.EvaluationId, s.FieldKey }).IsUnique();

            b.HasOne(s => s.Evaluation)
                .WithMany(e => e.Signatures)
                .HasForeignKey(s => s.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(s => s.SignedBy)
                .WithMany()
                .HasForeignKey(s => s.SignedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EvaluationSelfAssessment>(b =>
        {
            b.HasKey(s => s.EvaluationId);
            b.Property(s => s.DevelopmentNeeds).HasMaxLength(4000);
            b.Property(s => s.Report).HasMaxLength(20000);

            b.HasOne(s => s.Evaluation)
                .WithOne(e => e.SelfAssessment)
                .HasForeignKey<EvaluationSelfAssessment>(s => s.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);

            // Pozycje zawsze czytane i zapisywane razem z samooceną.
            b.OwnsMany(s => s.Criteria, o => o.ToJson());
        });

        modelBuilder.Entity<EvaluationNote>(b =>
        {
            foreach (var name in new[] { "Situation", "Action", "Result" })
            {
                b.Property<string?>(name).HasMaxLength(2000);
            }

            b.Property(n => n.IndicatorKey).HasMaxLength(100);
            b.Property(n => n.CriterionKey).HasMaxLength(100);
            b.HasIndex(n => new { n.EvaluationId, n.ObservedOn });

            b.HasOne(n => n.Evaluation)
                .WithMany()
                .HasForeignKey(n => n.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(n => n.Author)
                .WithMany()
                .HasForeignKey(n => n.AuthorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EvaluationIndicatorContext>(b =>
        {
            b.HasKey(c => new { c.EvaluationId, c.IndicatorKey });
            b.Property(c => c.IndicatorKey).HasMaxLength(100);
            b.Property(c => c.Expectation).HasMaxLength(2000);

            b.HasOne(c => c.Evaluation)
                .WithMany()
                .HasForeignKey(c => c.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EvaluationCriterionContext>(b =>
        {
            b.HasKey(c => new { c.EvaluationId, c.CriterionKey });
            b.Property(c => c.CriterionKey).HasMaxLength(100);
            b.Property(c => c.ScoreReason).HasMaxLength(2000);

            b.HasOne(c => c.Evaluation)
                .WithMany()
                .HasForeignKey(c => c.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EvaluationReminder>(b =>
        {
            b.Property(r => r.StageKey).HasMaxLength(50);
            b.Property(r => r.Message).HasMaxLength(1000);
            b.HasIndex(r => new { r.EvaluationId, r.SentAt });

            b.HasOne(r => r.Evaluation)
                .WithMany(e => e.Reminders)
                .HasForeignKey(r => r.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(r => r.Recipient)
                .WithMany()
                .HasForeignKey(r => r.RecipientId)
                .OnDelete(DeleteBehavior.SetNull);

            b.HasOne(r => r.SentBy)
                .WithMany()
                .HasForeignKey(r => r.SentById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<KnowledgeEmbedding>(b => b.HasKey(e => new { e.Hash, e.Model }));

        modelBuilder.Entity<EmployeeProfile>(b =>
        {
            b.HasKey(p => p.EmployeeId);
            b.HasOne(p => p.Employee)
                .WithOne()
                .HasForeignKey<EmployeeProfile>(p => p.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);

            foreach (var name in new[] { "MiddleName", "EmployeeNumber", "OtherId", "Nationality", "DriverLicenseNumber", "City",
                         "Province", "PostalCode", "Country", "PhoneHome", "PhoneMobile", "PhoneWork", "EmploymentType" })
            {
                b.Property<string?>(name).HasMaxLength(100);
            }

            b.Property(p => p.Gender).HasMaxLength(20);
            b.Property(p => p.MaritalStatus).HasMaxLength(20);
            b.Property(p => p.Street1).HasMaxLength(200);
            b.Property(p => p.Street2).HasMaxLength(200);
            b.Property(p => p.WorkEmail).HasMaxLength(256);
            b.Property(p => p.OtherEmail).HasMaxLength(256);

            // Listy pokazywane tylko w profilu, więc jako jsonb zamiast osobnych tabel.
            b.OwnsMany(p => p.EmergencyContacts, o => o.ToJson());
            b.OwnsMany(p => p.Dependents, o => o.ToJson());
            b.OwnsMany(p => p.WorkExperience, o => o.ToJson());
            b.OwnsMany(p => p.Education, o => o.ToJson());
            b.OwnsMany(p => p.Skills, o => o.ToJson());
            b.OwnsMany(p => p.Languages, o => o.ToJson());
        });

        modelBuilder.Entity<SignatureRequest>(b =>
        {
            b.Property(s => s.Title).HasMaxLength(200);
            b.Property(s => s.SignerName).HasMaxLength(200);
            b.Property(s => s.TokenHash).HasMaxLength(64);
            b.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
            b.Property(s => s.SignerIp).HasMaxLength(64);
            b.Property(s => s.SignerUserAgent).HasMaxLength(500);
            b.HasIndex(s => s.TokenHash).IsUnique();
            b.HasIndex(s => s.CreatedByUserId);

            b.HasOne(s => s.CreatedBy)
                .WithMany()
                .HasForeignKey(s => s.CreatedByUserId)
                .OnDelete(DeleteBehavior.Cascade);

            b.Property(s => s.EvaluationFieldKey).HasMaxLength(100);
            b.Property(s => s.EvaluationRole).HasConversion<string>().HasMaxLength(20);
            b.HasIndex(s => new { s.EvaluationId, s.EvaluationFieldKey });
            b.HasOne(s => s.Evaluation)
                .WithMany()
                .HasForeignKey(s => s.EvaluationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Role>(b =>
        {
            b.ToTable("roles");
            b.Property(r => r.Scope).HasConversion<string>().HasMaxLength(20);
            b.HasData(PermissionSeed.Roles);
        });

        modelBuilder.Entity<Permission>(b =>
        {
            b.Property(p => p.Id).ValueGeneratedNever();
            b.Property(p => p.Key).HasMaxLength(100);
            b.Property(p => p.Name).HasMaxLength(200);
            b.HasIndex(p => p.Key).IsUnique();
            b.HasData(PermissionSeed.Permissions);
        });

        modelBuilder.Entity<RolePermission>(b =>
        {
            b.HasKey(rp => new { rp.RoleId, rp.PermissionId });

            b.HasOne(rp => rp.Role)
                .WithMany(r => r.Permissions)
                .HasForeignKey(rp => rp.RoleId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(rp => rp.Permission)
                .WithMany()
                .HasForeignKey(rp => rp.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasData(PermissionSeed.RolePermissions);
        });

        modelBuilder.Entity<Service>(b =>
        {
            b.Property(s => s.Name).HasMaxLength(200);
            b.Property(s => s.LogoUrl).HasMaxLength(500);
            b.HasIndex(s => s.Name).IsUnique();
        });

        modelBuilder.Entity<Location>(b =>
        {
            b.Property(l => l.Name).HasMaxLength(200);
            b.HasIndex(l => new { l.ServiceId, l.Name }).IsUnique();

            b.HasOne(l => l.Service)
                .WithMany(s => s.Locations)
                .HasForeignKey(l => l.ServiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Department>(b =>
        {
            b.Property(d => d.Name).HasMaxLength(200);
            b.HasIndex(d => new { d.LocationId, d.Name }).IsUnique();

            b.HasOne(d => d.Location)
                .WithMany(l => l.Departments)
                .HasForeignKey(d => d.LocationId)
                .OnDelete(DeleteBehavior.Restrict);

            // Usunięcie kierującego zostawia wydział bez kierującego.
            b.HasOne(d => d.Head)
                .WithMany()
                .HasForeignKey(d => d.HeadId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Employee>(b =>
        {
            b.ToTable(t => t.HasCheckConstraint("ck_employees_supervisor_not_self", "supervisor_id <> id"));

            b.Property(e => e.FirstName).HasMaxLength(100);
            b.Property(e => e.LastName).HasMaxLength(100);

            b.HasOne(e => e.Department)
                .WithMany(d => d.Employees)
                .HasForeignKey(e => e.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            // Stanowiska przypisanego pracownikom nie da się usunąć — najpierw trzeba ich przepiąć.
            b.HasOne(e => e.Position)
                .WithMany(p => p.Employees)
                .HasForeignKey(e => e.PositionId)
                .OnDelete(DeleteBehavior.Restrict);

            // Nie można usunąć przełożonego, dopóki ma podwładnych — najpierw trzeba ich przepiąć.
            b.HasOne(e => e.Supervisor)
                .WithMany(e => e.Subordinates)
                .HasForeignKey(e => e.SupervisorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Position>(b =>
        {
            b.Property(p => p.Name).HasMaxLength(200);
            b.HasIndex(p => new { p.ServiceId, p.Name }).IsUnique();

            b.HasOne(p => p.Service)
                .WithMany()
                .HasForeignKey(p => p.ServiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AbsenceReason>(b =>
        {
            b.Property(r => r.Name).HasMaxLength(200);
            b.HasIndex(r => r.Name).IsUnique();
            b.Property(r => r.Kind).HasConversion<string>().HasMaxLength(20);

            // Słownik stały (bez API do dopisywania), więc jawne Id nie zderzą się z sekwencją.
            b.HasData(
                new AbsenceReason { Id = 1, Name = "Urlop wypoczynkowy", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 2, Name = "Zwolnienie lekarskie", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 3, Name = "Urlop macierzyński", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 4, Name = "Urlop rodzicielski", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 5, Name = "Urlop wychowawczy", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 6, Name = "Urlop bezpłatny", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 7, Name = "Urlop szkoleniowy", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 8, Name = "Inna nieobecność usprawiedliwiona", Kind = AbsenceKind.Justified },
                new AbsenceReason { Id = 9, Name = "Obowiązki służbowe poza miejscem pracy", Kind = AbsenceKind.OfficialDuty },
                new AbsenceReason { Id = 10, Name = "Nieobecność nieusprawiedliwiona", Kind = AbsenceKind.Unjustified });
        });

        modelBuilder.Entity<Absence>(b =>
        {
            b.ToTable(t => t.HasCheckConstraint("ck_absences_end_not_before_start", "end_date >= start_date"));

            // Typowe zapytanie: nieobecności pracownika w zakresie dat.
            b.HasIndex(a => new { a.EmployeeId, a.StartDate });

            b.HasOne(a => a.Employee)
                .WithMany(e => e.Absences)
                .HasForeignKey(a => a.EmployeeId)
                .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(a => a.Reason)
                .WithMany(r => r.Absences)
                .HasForeignKey(a => a.ReasonId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
