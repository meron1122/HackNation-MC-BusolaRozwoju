namespace Busola.Database.Entities;

/// <summary>Poziom widoku roli: czyje dane obejmują jej uprawnienia.</summary>
public enum DataScope
{
    /// <summary>Tylko własny rekord pracownika.</summary>
    Own,

    /// <summary>Podwładni bezpośredni i pośredni.</summary>
    Subordinates,

    /// <summary>Wszystko w służbie, do której należy użytkownik (przez swój wydział).</summary>
    Service,

    /// <summary>Wszystko.</summary>
    All,
}
