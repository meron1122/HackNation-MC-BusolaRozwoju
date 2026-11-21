using System.Security.Cryptography;

namespace Busola.Api.Infrastructure;

public static class PasswordGenerator
{
    /// <summary>16 znaków, zawsze z wielką i małą literą, cyfrą i znakiem specjalnym (polityka haseł Identity), bez mylących I/l/O/0/1.</summary>
    public static string Generate()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnpqrstuvwxyz";
        const string digits = "23456789";
        const string special = "!@#%*-_+";
        const string all = upper + lower + digits + special;

        var chars = new[] { upper, lower, digits, special }
            .Select(set => set[RandomNumberGenerator.GetInt32(set.Length)])
            .ToList();
        while (chars.Count < 16)
        {
            chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
        }

        RandomNumberGenerator.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(chars));
        return new string(chars.ToArray());
    }
}
