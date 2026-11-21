using Busola.Database.Authorization;
using Busola.Database.Entities;
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

            // Nie można usunąć przełożonego, dopóki ma podwładnych — najpierw trzeba ich przepiąć.
            b.HasOne(e => e.Supervisor)
                .WithMany(e => e.Subordinates)
                .HasForeignKey(e => e.SupervisorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AbsenceReason>(b =>
        {
            b.Property(r => r.Name).HasMaxLength(200);
            b.HasIndex(r => r.Name).IsUnique();
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
