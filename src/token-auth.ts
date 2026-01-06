import * as vscode from 'vscode';

export interface TokenValidationResponse {
  access: boolean;
  status?: 'trialing' | 'active' | 'inactive' | 'pro';
  user_email?: string;
  message?: string;
}

// Token expiration map (token -> expiry date)
const TOKEN_EXPIRATION: Record<string, string> = {
  // Batch 1 - Expires Feb 6, 2026
  'PROMPTR_PREMIUM_DmnDqQmFamVPc5CuacpRn_uELs_VIR5gkZl8DlywPho': '2026-02-06',
  'PROMPTR_PREMIUM_YyttSuaDd7vxdCcS9rVUm4j9zL-s-MCmV-gKzcpyPXI': '2026-02-06',
  'PROMPTR_PREMIUM_RnJ_49-RLpjDNbwzdycMUI7ZJvJUS_JE9x8WsEAwZ0E': '2026-02-06',
  'PROMPTR_PREMIUM_Fqab-R7SwKO-ICKLV7sSyiGml8EROZY0mMPk6JsduYg': '2026-02-06',
  'PROMPTR_PREMIUM_Z1msXe0mzTcAy03QLS2YWKF9E7edVlhv6BqEB7WUBRg': '2026-02-06',
  'PROMPTR_PREMIUM_HArE0PZrhEltV2DVVYUKCvY8lUWL1InJ5HoW1nYRr3M': '2026-02-06',
  'PROMPTR_PREMIUM_2c7yFiTHYPP4puWHNDXi6pSoV1F4T6d7a82QFsdDiPc': '2026-02-06',
  'PROMPTR_PREMIUM_jyMrwITWGh88VsPFsVx2AFLZhaLNwrWn7b3kmURsiCM': '2026-02-06',
  'PROMPTR_PREMIUM_LB6hl3H_APN8xrwJNV3Kq5HIo73IGQQbptD7YICU9Sg': '2026-02-06',
  'PROMPTR_PREMIUM_Qh5C9cGSevipmRLgo_Bwi0ekP0NJwko8_dmLlTGIy_s': '2026-02-06',
  'PROMPTR_PREMIUM_u_q3qTBII5UKuGsMRNIdZd9J4JV_LjxC-6MYOcaxzak': '2026-02-06',
  'PROMPTR_PREMIUM_D4H2h2eOR-Ep3wEfGifWrCsC6i2I94xksB_hgib7N_A': '2026-02-06',
  'PROMPTR_PREMIUM_3W_iNihwF0b68ph9w9PHetfwE67RgDE3_Gk2i83ugp4': '2026-02-06',
  'PROMPTR_PREMIUM_eHwPZGpMLBc-L4U5Qzdx5J2udjMXJrrGyKfYJ32KHfU': '2026-02-06',
  'PROMPTR_PREMIUM_Sswj3aFd2V5KZUEWXYgE0PwY9HOKFitc6V-7LS08sRk': '2026-02-06',
  'PROMPTR_PREMIUM_9cnKsy1DUgv6lV3QitbJbiQ4WBS5-oIkrcTUtSQ_jYM': '2026-02-06',
  'PROMPTR_PREMIUM__F_Dx22kucE2EWPHtu0YCIL0PQafvTXo7BPB0zJjCi0': '2026-02-06',
  'PROMPTR_PREMIUM_4S3gui4TH5pwQcFl22PBTaX5YWuck-dhz2E7V5apJgw': '2026-02-06',
  'PROMPTR_PREMIUM_zsr28Sa5nB2_VORnsAzmMju4KVL8lFZ15Zj1_CGPi54': '2026-02-06',
  'PROMPTR_PREMIUM_DPNc_3dk3QFcdxv-W99enBINpvkc5AcjiseBQy2KKqg': '2026-02-06',
  'PROMPTR_PREMIUM_F_cO1i7iPqzeitVXLVOeJQ6dO6tgtxTjhv_u1QGLE9k': '2026-02-06',
  'PROMPTR_PREMIUM_itoiTYJDAaol0iQihzCnVwA5WBqTJremb-4BmlpuNsM': '2026-02-06',
  'PROMPTR_PREMIUM_XBT_l82EcL0PVUp5beYmGTp_YzIEfx3UtseZv4vBDOU': '2026-02-06',
  'PROMPTR_PREMIUM_t8GRmHn2iILdYAFOwFSwvoqD3cGn_43kQa1yliuJULE': '2026-02-06',
  'PROMPTR_PREMIUM_fB2gGX8-A-Q_Lqli54yW0ANyGYiab9gFG0TQtVhAKa4': '2026-02-06',
  'PROMPTR_PREMIUM_zJ9G-ApcOK5XuccVp1ehh3N1UaIZMb7IOtXxAo0CUqo': '2026-02-06',
  'PROMPTR_PREMIUM_ghBKCMvDYCThUzBS8vxg2IkqASEhNGnbqohQLj5o-eo': '2026-02-06',
  'PROMPTR_PREMIUM_sJlMeqwX0aSvc1EBTmxWDCmNWULNWIJfvu8oAU9ZaBA': '2026-02-06',
  'PROMPTR_PREMIUM_yXaMO_IekDurtvQKGIV6IJAuWAgNwNWNRgevDMVaUV0': '2026-02-06',
  'PROMPTR_PREMIUM_2HKDgf6SceoIZnZKTkAghCChqB9_PpN3Eui-dfHdSMo': '2026-02-06',
  // Batch 2 - Expires Feb 6, 2026
  'PROMPTR_PREMIUM_xS4RdZ10EH2pYLdUKqjZC2uGVYN7X2h8wZftAnKrLRk': '2026-02-06',
  'PROMPTR_PREMIUM_eZzWP9bpd64cJlwUKbP3oWv5L51SR4T5FP8QABsKwJs': '2026-02-06',
  'PROMPTR_PREMIUM_iSqESNl52LuiyyqhdCIWpPFgffdYIacbwCGEy6Bz6K8': '2026-02-06',
  'PROMPTR_PREMIUM_JQNOlKnBbxv3hxmzUfKZju9YjLjFjsvDnynqhYWFlWo': '2026-02-06',
  'PROMPTR_PREMIUM_Q8YExQ2d4716wKc6N6w4wLGMwYbqLydYoUk5araJ-0A': '2026-02-06',
  'PROMPTR_PREMIUM_9_TgUHF9sT0e88YvrAzvwIYJ78xu_iKrYK5ZW1K59XQ': '2026-02-06',
  'PROMPTR_PREMIUM_K-EbFug-FaYR0RTk13roP2dyZrASGiWAFgtZiWkYRKI': '2026-02-06',
  'PROMPTR_PREMIUM_QQWbu9z4sdCIc6WgHXDoW4n_I_abK45OeytD3mfkfvc': '2026-02-06',
  'PROMPTR_PREMIUM_ZXbUAE1DrSLpLUXvnrjHSoJD2J36_JISKeuPCxBCfsQ': '2026-02-06',
  'PROMPTR_PREMIUM_Vn-WlubCkJ7L8jTncBmMxr-UJAv7YiK1pplPC0D4izg': '2026-02-06',
  'PROMPTR_PREMIUM_piGvp3SawnFrMae-yqZIYygvsn9FgxnJOLkgbPjYoQA': '2026-02-06',
  'PROMPTR_PREMIUM_OkUN7btuTGxrKE9CJOYX4yEBYRvmIkulrGutPe7sBKw': '2026-02-06',
  'PROMPTR_PREMIUM_oGxJ0l7GQwz6w8gJ-muUtOscPnonMAyaowyND2mqguM': '2026-02-06',
  'PROMPTR_PREMIUM_plZ8p7FHMaLHHvPLycF3eQz5MGsWBtdTco1lJ_EECkg': '2026-02-06',
  'PROMPTR_PREMIUM_5evF74yXpVl7YGO_Ch69iApCUjH0JT8g_KhTjoWPTrI': '2026-02-06',
  'PROMPTR_PREMIUM_gpZkmmaIMa2k4IIvCYmRi25NFJA1eT5t2JneLoqcspc': '2026-02-06',
  'PROMPTR_PREMIUM_fqQqZpeKbCXxPTZQF-m0Pl6KhuWTqoze20Ka1ut3hv4': '2026-02-06',
  'PROMPTR_PREMIUM_FOZ_m5SHg6YELv29qv_QhnFgtJkfPgjaZurKfsedoRo': '2026-02-06',
  'PROMPTR_PREMIUM_cse1J45aUUBvNlsPyWK9ojWR39FmowbJv4dLwRCR0G0': '2026-02-06',
  'PROMPTR_PREMIUM_gf90_Pgc1KO-MrKb2cQD_8_hlqPZynjSHhQ4I6N0REA': '2026-02-06',
  'PROMPTR_PREMIUM_NcX8Ea7ToVfEZwkI26h2FWLDuv6LKqOLgOvOAHfQPqM': '2026-02-06',
  'PROMPTR_PREMIUM_89gaWqwOG5RUSEqxI9nE_pRiAJrBUbWTK7ZU3CiB7Qw': '2026-02-06',
  'PROMPTR_PREMIUM_CY-mExTwR2JpJVcZmhyx8zs21RgVaIYG5cnkCvG3AW0': '2026-02-06',
  'PROMPTR_PREMIUM_3mk5iYNVzgEcHuomQKqPrZ3X1mS_gG-DxpDJ9YxlfDs': '2026-02-06',
  'PROMPTR_PREMIUM_XuJoMRlKLjJhIkcjpj7opHrC8_Tva0eQbAd50RBSAb4': '2026-02-06',
  'PROMPTR_PREMIUM_MDhdMiPkFaIXsP6xU7hfoO2by4zlsDhTcPUeNPgoWaM': '2026-02-06',
  'PROMPTR_PREMIUM_m_5AamMmEgc8W8-Ww47TrCg7explpjlYF1P9-TdhW70': '2026-02-06',
  'PROMPTR_PREMIUM_gSQYd-GEscS_UEb6f24lEHuKw7srQMJsRxza3sPHayw': '2026-02-06',
  'PROMPTR_PREMIUM_1eQTpsb9X6QH2Us3ekWwAcQXpCo996AhRdsmwIMWWoY': '2026-02-06',
  'PROMPTR_PREMIUM_eAZk-6ts5p8UCO9jpKFf2hHyd3rI_xro_QM0a3Hqm5E': '2026-02-06',
  // Batch 3 - Expires Feb 6, 2026
  'PROMPTR_PREMIUM_ZlctWTVNCKcQBurDV36aMsudErkccl4k7R6qMfpYovA': '2026-02-06',
  'PROMPTR_PREMIUM_4UjnSI7djK1zNcIQRak7oG9O8kUdM-qdxspJ5A4t0uU': '2026-02-06',
  'PROMPTR_PREMIUM_2-M895gQPwCNVfRsV_Tu6iYc1vGTMWEUPCsO15aRzoQ': '2026-02-06',
  'PROMPTR_PREMIUM_yPyXVPPiT-UnJthCUSSjeztLxUr_kgaFE8QCEBo82SE': '2026-02-06',
  'PROMPTR_PREMIUM_ATdS6pyBKcI6zmAZXW3D84Fz7Stiz_6QJ6_31RlOmnA': '2026-02-06',
  'PROMPTR_PREMIUM_rw3FlsGTMhUwXNYLf3zJxTvwCh9A4eCYEIcBsr8bvAs': '2026-02-06',
  'PROMPTR_PREMIUM_hxI4jOiBJvv9hpNmIJLEdXqjBBPCYk31yq6jNfnssbs': '2026-02-06',
  'PROMPTR_PREMIUM_0GGq1yJOckeGfjyb6d2182HFHe2TmGOshVEP98dO0ao': '2026-02-06',
  'PROMPTR_PREMIUM_niGkbQdJQ2HUpL8wKG4ETgCLQLM7IM2jKWwwxSUNXek': '2026-02-06',
  'PROMPTR_PREMIUM_NKnKdZHtfk9AhqIKN093cvCY4aGPjMnxmFEq4VTksbM': '2026-02-06',
  'PROMPTR_PREMIUM_nnLd2eW3Av5Ad8jLMqKiXAwhsD1fWhRBer8FIIEbgqc': '2026-02-06',
  'PROMPTR_PREMIUM_q1AkBniIQvoEuUy7Enn5PcA8DPYUz7v9iq_eLxtIWTs': '2026-02-06',
  'PROMPTR_PREMIUM_3CZ235G89USgz88EywqWLQe2Kb-dkeSl3J1l8p7WA7w': '2026-02-06',
  'PROMPTR_PREMIUM_IdgpO2zf6kSckcm2fTBTwEH6sOyE0Mzdlgn7foJGVk0': '2026-02-06',
  'PROMPTR_PREMIUM_qmyjg6tt5Vy2ib33vQhYgR3lfFkLvlHz-iwGhDvofVQ': '2026-02-06',
  'PROMPTR_PREMIUM_G_R0XyhCwGLwtJqIChJeFMmhB4kd2GIjtSOnLIXp1dk': '2026-02-06',
  'PROMPTR_PREMIUM_Yru_NXFvlip_llG3WAxg1A_pEtpo7TkyjRhGHcrXB6c': '2026-02-06',
  'PROMPTR_PREMIUM_90YCF2WbqMkSAAzlD8FNHpLQmaKK-5fw8wNdYThKHgU': '2026-02-06',
  'PROMPTR_PREMIUM_1yG1BhGaYpWjhzm7bXLcIWH7hpyNDQ7IxpRamJblZKg': '2026-02-06',
  'PROMPTR_PREMIUM_676dyfk4onvxujK89fY-CGrSbl6IzQCDtOXDMIjidCM': '2026-02-06',
  'PROMPTR_PREMIUM_HbBPytfYK3cq6hsK8ooUkH-Mpzh4LBYP0P-cbvtPJcc': '2026-02-06',
  'PROMPTR_PREMIUM_ER2Z-GoWBIbCN12J-Q6fAaHNVV0D7heDcf-IB4f3ckU': '2026-02-06',
  'PROMPTR_PREMIUM_wsmI5VUOeFVkp5um4ruEvYm_3o8FQ0bZWhkizV2jll0': '2026-02-06',
  'PROMPTR_PREMIUM_THOztALb5AReHQiMQ9xRnCuTSTlX2ATLJvns0ImINE8': '2026-02-06',
  'PROMPTR_PREMIUM_yiW_wbR-4sqQErjgaUhA6I-qszptxi7zvwZ1oaJ6XrA': '2026-02-06',
  'PROMPTR_PREMIUM_6dRE-hD5_aP7OYzvPU15ylMgoBv8SfG2gTSK4FWZQlM': '2026-02-06',
  'PROMPTR_PREMIUM_MT8zGh03rtkzRju-Ymx9LKmLmOw6N0TupCoYfU2HUgg': '2026-02-06',
  'PROMPTR_PREMIUM_eKuihNC_0Jmt4AvsYz9FldAgDinxsvQ4cFkluACPQ3g': '2026-02-06',
  'PROMPTR_PREMIUM_CHbeLUKIcQyT2Fmf6OV4aAGRcokeck-PH40r2liYPQs': '2026-02-06',
  'PROMPTR_PREMIUM_Qral_1seVbdQ2TkfIczlvrdPVCH-n9KzCPL1cuCmZe0': '2026-02-06',
};

// Valid premium tokens (hardcoded for security) - permanent tokens
const VALID_PREMIUM_TOKENS = new Set([
  'PROMPTR_PREMIUM_WPKmg1NPiyPL6ijE9nVBJ1xHb23mafnatop8hKAgxF4',
  'PROMPTR_PREMIUM_m9PsptMLoWK4Ls_VmLHzJ4Wc8A0M8TXOySPEdqdc_KE',
  'PROMPTR_PREMIUM_AL7yc1mI6cEkxmRMVchlT--_5d__6OHs2KDV1Sf92Yg',
  'PROMPTR_PREMIUM_VhcWcX0HAIZFohVJPZa7tJ6CBd78sX8gOqIOFPy4r0o',
  'PROMPTR_PREMIUM_vTM5gjEmgMX0Y0s3mRpCr-kvKws6JClLW1bhKbK6EU8',
  'PROMPTR_PREMIUM_NmNgSrUin-1pn0E39Tzgq9M13NSygJutkhtN7meiucE',
  'PROMPTR_PREMIUM_eFuGY9Z0wfZ37We6rCjswJ8gX3tEEyo2ws4AVUBUjjE',
  'PROMPTR_PREMIUM_GD0KgGXToXziENHtSejhmowb3zG1mOl2IXJcCtllfFI',
  'PROMPTR_PREMIUM_U_1oODvVdhhtkyUXeFj4X7CUtbDLpfnfZk7EvMWfJiI',
  'PROMPTR_PREMIUM_fw8gF5vB1rlqm4JY8l18wHQn-XbIAFGOa0ieM-_9W24',
  'PROMPTR_PREMIUM_Xf-FcQ3dqb7BXBT0bogR8M_oGfgBGZ7VyqPtObh_Ncg',
  'PROMPTR_PREMIUM_fqYZR8t19AWs6FaD8Sttf0yfiUCRjqka2vDTOEgbAtY',
  'PROMPTR_PREMIUM_1flPAp5-qgqrD709lpwkWnZVdSI_Udn5lQUHvvCqdGg',
  'PROMPTR_PREMIUM_Q1Ww6sYqEo56CehclfEgH2LWNQ4lCLgMifiAS04p9ms',
  'PROMPTR_PREMIUM_T6UW7anMYvmwyAMk8uAaqyUIEvz2MMIsc4q-AQdbo00',
  'PROMPTR_PREMIUM_22DOjgcaMrcsNA7o0L3II8L7KQlMqi3Cx6As7QSliT8',
  'PROMPTR_PREMIUM_8H9oOPSgdIQZLrXsxbaUVp40BAOORGEs6KUrprsGHOc',
  'PROMPTR_PREMIUM_3NkUD85OWxuK_zuzj0kTNrsPgTESgM_-GTOAIS4_iD8',
  'PROMPTR_PREMIUM_gn4gKEtwqzqfULZEH3vGgdYoHg-7mBj3-sMSoNxFFHM',
  'PROMPTR_PREMIUM_puPeS0Gr9pXTxjAjpvJE8lpCBAnkYkwF0akXZQnKPro',
  'PROMPTR_PREMIUM_6j33fde7JF6k-tZG_z4j1VN2wKXiIip4WSuWs6sNCV4',
  'PROMPTR_PREMIUM__6w-wsvPjHwtL7ECfRPsA6iq8wM-PXuznwlDonzD_DE',
  'PROMPTR_PREMIUM_67vOOO1hTIWEFzJVP2RBYHfrAODU4UEyjjda0b_ccZo',
  'PROMPTR_PREMIUM_IeeFxfdTQMD7YOnT-tL6L-osjwghwLvkzi1w60QUygc',
  'PROMPTR_PREMIUM_YNf8rN1NsQ7xE4WwI5iViLrpAzOqBRquUR8Uqk4wXGM',
  'PROMPTR_PREMIUM_pek4BsQ1pcs-ezXBre0gKv7OWJqjiHxch9-yO7qW1fk',
  'PROMPTR_PREMIUM_2ixU_x8dCuPuYS3xNwvk1U5rKRZkgu3oVL7A_WWT33o',
  'PROMPTR_PREMIUM_e6t0L4u3pos31UoCuCxgMqBIqTYTp_suThB1-PkPyKc',
  'PROMPTR_PREMIUM_Pvvt4gPZP6-56Z5v13XXhre9GkYaodW5-gxCRlsbeqI',
  'PROMPTR_PREMIUM_yMCKfUKPvFLoLXbjhsf3PZOjKm92BojDltacikXGEHc',
  'PROMPTR_PREMIUM_LkQ7eX9G2zS4pV8mT1aC6nR3yW0dH5uJ7bK2fM8oPiQ',
  'PROMPTR_PREMIUM_R9nV2pL7kT1cX6sY3mB8dF0aH5gJ2wQ4zU8iO1rNcE',
  'PROMPTR_PREMIUM_qW8zX3cV6bN1mT4pR7yL2kJ9hG0aF5dS8uO3iP1vMe',
  'PROMPTR_PREMIUM_Ab7Y2kQ9pL4nV1tX6cR3mF8dH0aG5jS2uW8iO1zPe',
  'PROMPTR_PREMIUM_Nx6C1vB7kL2mT9pR4yJ8aH0fG5dS3uW8iO1zQeV2n',
  'PROMPTR_PREMIUM_Ty9P2nL7kC1xV6sR3mB8fD0aH5gJ2wQ4zU8iO1rNe',
  'PROMPTR_PREMIUM_Gh5J2wQ4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA0eHg',
  'PROMPTR_PREMIUM_Vm8T1aC6nR3yW0dH5uJ7bK2fM8oPqL4xZ9sE2iY7r',
  'PROMPTR_PREMIUM_Kb2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8yJ0dHg',
  'PROMPTR_PREMIUM_wQ4zU8iO1rNe9vB2kL7mT1cX6sY3pF8dA0eHg5J2',
  'PROMPTR_PREMIUM_2ixV7sY3mB8dF0aH5gJ2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_M3tY9eF0aH6gK4WjS2uD8iC0lBp7qV1xN5zR8yL2',
  'PROMPTR_PREMIUM_P6xQdX2LwGZyK4UjW1rC8N0a5Q9vB2kL7mT1cX6s',
  'PROMPTR_PREMIUM_J0aH5gK4WjS2uD8iC0lBp7qV1xN5zR8yL2mT9pF3d',
  'PROMPTR_PREMIUM_Z9sE2iY7rV6tN1cX4pR8yJ0dHg5J2wQ4zU8iO1rN',
  'PROMPTR_PREMIUM_C6nR3yW0dH5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6',
  'PROMPTR_PREMIUM_oPqL4xZ9sE2iY7rV6tN1cX4pR8yJ0dHg5J2wQ4zU',
  'PROMPTR_PREMIUM_yW0dH5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX',
  'PROMPTR_PREMIUM_bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8yJ0dH',
  'PROMPTR_PREMIUM_iC0lBp7qV1xN5zR8yL2mT9pF3dG6hJ4kW8sY2vU0',
  'PROMPTR_PREMIUM_S2uD8iC0lBp7qV1xN5zR8yL2mT9pF3dG6hJ4kW8s',
  'PROMPTR_PREMIUM_Q4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA0eHg5J2w',
  'PROMPTR_PREMIUM_L2mT9pF3dG6hJ4kW8sY2vU0aC5nR7yT1xP9qV3b',
  'PROMPTR_PREMIUM_U1rN9vB2kL7mT1cX6sY3pF8dA0eHg5J2wQ4zU8i',
  'PROMPTR_PREMIUM_X6sY3pF8dA0eHg5J2wQ4zU8iO1rN9vB2kL7mT1c',
  'PROMPTR_PREMIUM_D0eHg5J2wQ4zU8iO1rN9vB2kL7mT1cX6sY3pF8dA',
  'PROMPTR_PREMIUM_R8yL2mT9pF3dG6hJ4kW8sY2vU0aC5nR7yT1xP9qV',
  'PROMPTR_PREMIUM_T1cX6sY3pF8dA0eHg5J2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_V6tN1cX4pR8yJ0dHg5J2wQ4zU8iO1rN9vB2kL7mT',
  'PROMPTR_PREMIUM_H5uJ7bK2fM8oPiQ7lW3xZ9sE2iY7rV6tN1cX4pR8',
  'PROMPTR_PREMIUM_A9kF3wN7pL2mX6sT0vB4hJ8eR1yQ5dG9iC3nZ7oU2',
  'PROMPTR_PREMIUM_P2xL7nQ3kV6bM9sE1yR4jH8fT0dW5aG2iN7oC4uP8',
  'PROMPTR_PREMIUM_K4jH8bN2mT5xW1sP9vL3fR7yC6eQ0dG4iA8oU2nZ5',
  'PROMPTR_PREMIUM_E7nR3mW6tL9bP2xK5sJ1vH4fY8dQ0oG3iC7aU4nZ2',
  'PROMPTR_PREMIUM_T1vM8xL4nP7bR2sW5jK9eH3fY6dC0oA2iG8uN4qZ7',
  'PROMPTR_PREMIUM_W9sJ2mL7bX4pN1vT5kR8fH3eY6dQ0oC2iA7uG4nZ5',
  'PROMPTR_PREMIUM_N3kP7mW2bT9xL5sR1vJ6fH4eY8dQ0oC3iG7aU2nZ4',
  'PROMPTR_PREMIUM_R6mT2nW8bX5pL1sJ9vK4fH7eY3dQ0oC2iA6uG4nZ8',
  'PROMPTR_PREMIUM_L5xJ9bW3mT7pN2sK6vR1fH4eY8dQ0oC5iG3aU7nZ2',
  'PROMPTR_PREMIUM_M8pR4nW2bX6mL9sT3vJ7fH1eY5dQ0oC4iG8aU2nZ6',
  'PROMPTR_PREMIUM_J2nT7mW5bX9pL4sR8vK1fH6eY3dQ0oC2iG4aU7nZ5',
  'PROMPTR_PREMIUM_Q5mX8nW2bT4pL7sJ1vR9fH3eY6dQ0oC5iG2aU4nZ8',
  'PROMPTR_PREMIUM_H7pL3mW9bX2nT6sK4vR8fJ1eY5dQ0oC7iG3aU2nZ6',
  'PROMPTR_PREMIUM_B4nW8mT2bX7pL5sR1vJ9fH6eY3dQ0oC4iG8aU5nZ2',
  'PROMPTR_PREMIUM_D9mL6nW3bT5xP2sR8vK4fH7eY1dQ0oC9iG6aU3nZ5',
  'PROMPTR_PREMIUM_F2pK7mW4bX9nT3sL6vR1fH8eY5dQ0oC2iG7aU4nZ6',
  'PROMPTR_PREMIUM_G8nR5mW2bT6pL4sX9vJ3fH1eY7dQ0oC8iG5aU2nZ4',
  'PROMPTR_PREMIUM_V3mT9nW7bX2pL5sK8vR4fH6eY1dQ0oC3iG9aU7nZ2',
  'PROMPTR_PREMIUM_S6pX4mW8bT3nL7sR2vJ5fH9eY1dQ0oC6iG4aU8nZ3',
  'PROMPTR_PREMIUM_Y1nL9mW5bX8pT4sK7vR2fH3eY6dQ0oC1iG9aU5nZ8',
  'PROMPTR_PREMIUM_Z8mK3nW6bT2pL9sX5vR7fH4eY1dQ0oC8iG3aU6nZ2',
  'PROMPTR_PREMIUM_I5pT8mW4bX7nL2sR9vK6fH3eY1dQ0oC5iG8aU4nZ7',
  'PROMPTR_PREMIUM_O7nX2mW9bT5pL8sK3vR6fH4eY1dQ0oC7iG2aU9nZ5',
  'PROMPTR_PREMIUM_U4mR7nW3bX8pT2sL5vJ9fH6eY1dQ0oC4iG7aU3nZ8',
  'PROMPTR_PREMIUM_C9pL2mW6bT4nX7sR5vK8fH3eY1dQ0oC9iG2aU6nZ4',
  'PROMPTR_PREMIUM_X3nK8mW5bT9pL2sX6vR4fH7eY1dQ0oC3iG8aU5nZ9',
  'PROMPTR_PREMIUM_A6mT4nW7bX3pL9sK2vR5fH8eY1dQ0oC6iG4aU7nZ3',
  'PROMPTR_PREMIUM_E1pR9mW8bT6nL3sX7vK4fH2eY5dQ0oC1iG9aU8nZ6',
  'PROMPTR_PREMIUM_T4nX5mW2bT8pL7sR3vJ6fH9eY1dQ0oC4iG5aU2nZ8',
  // New tokens - Batch 2025-11-22
  'PROMPTR_PREMIUM_K8mP3nW6bT9xL2sR5vJ7fH4eY1dQ0oC8iG3aU6nZ9',
  'PROMPTR_PREMIUM_Q2nT7mW4bX9pL5sK8vR3fH6eY1dQ0oC2iG7aU4nZ8',
  'PROMPTR_PREMIUM_R5pL9mW3bT6nX2sK7vJ4fH8eY1dQ0oC5iG9aU3nZ6',
  'PROMPTR_PREMIUM_M7nK4mW8bX3pL6sR9vT2fH5eY1dQ0oC7iG4aU8nZ3',
  'PROMPTR_PREMIUM_N3mX6nW5bT8pL4sK9vR7fH2eY1dQ0oC3iG6aU5nZ8',
  'PROMPTR_PREMIUM_P9nR2mW7bX5pL8sT4vK6fH3eY1dQ0oC9iG2aU7nZ5',
  'PROMPTR_PREMIUM_V4mL8nW3bT7pX2sR6vJ9fH5eY1dQ0oC4iG8aU3nZ7',
  'PROMPTR_PREMIUM_W6pT3mW9bX4nL7sK2vR8fH5eY1dQ0oC6iG3aU9nZ4',
  'PROMPTR_PREMIUM_X8nJ5mW2bT4pL9sX7vR3fH6eY1dQ0oC8iG5aU2nZ9',
  'PROMPTR_PREMIUM_Y2mR9nW6bX8pL3sK5vT7fH4eY1dQ0oC2iG9aU6nZ8',
  'PROMPTR_PREMIUM_Z7pK4mW5bT9nX6sR2vL8fH3eY1dQ0oC7iG4aU5nZ9',
  'PROMPTR_PREMIUM_A3nT8mW4bX7pL5sJ9vR6fH2eY1dQ0oC3iG8aU4nZ7',
  'PROMPTR_PREMIUM_B5mP7nW9bT3xL8sK4vR2fH6eY1dQ0oC5iG7aU9nZ3',
  'PROMPTR_PREMIUM_C9pX2mW6bT5nL7sR4vK8fH3eY1dQ0oC9iG2aU6nZ5',
  'PROMPTR_PREMIUM_D4nL6mW8bX9pT3sR7vJ5fH2eY1dQ0oC4iG6aU8nZ9',
  'PROMPTR_PREMIUM_F8mK2nW5bT7pL9sX4vR6fH3eY1dQ0oC8iG2aU5nZ7',
  'PROMPTR_PREMIUM_G6pR4mW3bX8nT7sK2vL9fH5eY1dQ0oC6iG4aU3nZ8',
  'PROMPTR_PREMIUM_H2nX9mW7bT4pL6sR8vJ3fH5eY1dQ0oC2iG9aU7nZ4',
  'PROMPTR_PREMIUM_I7mT3nW4bX6pL9sK5vR8fH2eY1dQ0oC7iG3aU4nZ6',
  'PROMPTR_PREMIUM_J9pL5mW2bT8nX4sR7vK3fH6eY1dQ0oC9iG5aU2nZ8',
  'PROMPTR_PREMIUM_L3nK8mW6bX2pT9sL5vR7fH4eY1dQ0oC3iG8aU6nZ2',
  'PROMPTR_PREMIUM_O5mR7nW4bT9pX3sK8vL6fH2eY1dQ0oC5iG7aU4nZ9',
  'PROMPTR_PREMIUM_S8pT2mW9bX5nL4sR7vK6fH3eY1dQ0oC8iG2aU9nZ5',
  'PROMPTR_PREMIUM_U6nP4mW3bT7pL8sX2vR9fH5eY1dQ0oC6iG4aU3nZ7',
  'PROMPTR_PREMIUM_T9mX5nW8bX3pL6sK4vR7fH2eY1dQ0oC9iG5aU8nZ3',
  'PROMPTR_PREMIUM_W2pL7mW4bT6nX9sR5vK8fH3eY1dQ0oC2iG7aU4nZ6',
  'PROMPTR_PREMIUM_X4nR8mW5bX9pT2sL6vJ7fH4eY1dQ0oC4iG8aU5nZ9',
  'PROMPTR_PREMIUM_Y7mK3nW6bT4pL8sX5vR9fH2eY1dQ0oC7iG3aU6nZ4',
  'PROMPTR_PREMIUM_Z5pJ9mW2bX7nT4sK6vR8fH3eY1dQ0oC5iG9aU2nZ7',
  'PROMPTR_PREMIUM_F3nT6mW8bX4pL9sR2vJ7fH5eY1dQ0oC3iG6aU8nZ4',
  // New tokens - Batch 2025-12-23
  'PROMPTR_PREMIUM_NK62waBKjv-TYcXgA92bj50mv49JdrgkKkyfLhZkAUQ',
  'PROMPTR_PREMIUM_lSNV-_mpoMhExSitATsIlshiNWt2-G16y3Imcj3XN2M',
  'PROMPTR_PREMIUM_gRjdqXyAT6qHBVsDaUxUL2ym0LZYMI6Ca0kj2qlaTD8',
  'PROMPTR_PREMIUM_gIIK2bqvvLcXi9pRmgxf7wPLs7RNJbmfjBn1NMaTV2M',
  'PROMPTR_PREMIUM_lBG_uyhRhYya1KKoD5QZ4A_fdUIJYm4u1zy806NTv2w',
  'PROMPTR_PREMIUM_M1DW7wyaox0KQqp3EO_KppDxEqTESqIVaincJoYUDzs',
  'PROMPTR_PREMIUM_Sg2OOQS0hbTGwitudxylQ32PhgkGYHwtlnDFaq1z_hE',
  'PROMPTR_PREMIUM_JxoPFHD6j_oYchPpqfw6calUkE6ZpuYc_ygyx1kvjQ4',
  'PROMPTR_PREMIUM_uqROieFdseABH6bi2AUIZ9voYGz3hwzj1GZMJWWWros',
  'PROMPTR_PREMIUM_HwKJvsdeBsQImul07gZqNLdgY5SJZ_TJ5R_AFQ6WC2s',
  'PROMPTR_PREMIUM_4mE70D9tkJH3nw6BGpkdRhXeoR4wF72s4r_RxvkTS8M',
  'PROMPTR_PREMIUM_lk_mkupME8NFvOLb8CPwyu59HvUb6LNhoSaegl-eEJM',
  'PROMPTR_PREMIUM_PPckf4di6WEkInASEakUC2KKNzE3zgCB9nnAHVFRtOM',
  'PROMPTR_PREMIUM_QxPzaVaAyXJIC56qlcOCV0Y1s8wpip_sQ9FVnIsYYew',
  'PROMPTR_PREMIUM_-Jk8wW6tHroVWVL5lx9L_6vTyRSYD5RGKIa8v5hvh38',
  'PROMPTR_PREMIUM_tb1InlJ-tGfIs9mEIh6pBY5fzAXyd34vnsRcOF9PS8Y',
  'PROMPTR_PREMIUM_v0GVsv5EN5muleOy4AuBjngoDm8JXVlM6MuUNZ8o6IE',
  'PROMPTR_PREMIUM_zxOaSTn1hhTdA1_7rwcFFaEmRLBRzNUcg6cwHmstOKs',
  'PROMPTR_PREMIUM_WdefrdJ5qHuNhLg63-7Q3eOKadxj5f0nz8K-iYXRvMA',
  'PROMPTR_PREMIUM_m1sRP8xQhcfIUcFszUb6miLFI0AcuVBVTEXmsACrMMI',
  'PROMPTR_PREMIUM_2-IBOqjcSSN9GDzmDL-UmAu6JfqkGScIA_5MbL4BhzA',
  'PROMPTR_PREMIUM_qmnOk1ikNTuyr8by7QXoT1O4sNxqt_j04gm6GMrFW_I',
  'PROMPTR_PREMIUM_slfEV9kPFiLxAulzCT1P2NcYJ0neZH6PzBiK_5HZI3s',
  'PROMPTR_PREMIUM_8xkW7-2ZI076twwyWXSpeamo60CqUZXmiiBvBBWJX1A',
  'PROMPTR_PREMIUM_IRQrEjD4hSuuzX4rtEjbBW4uHdTaC2lWCWKCoDCJoqM',
  'PROMPTR_PREMIUM_XjFqgJaws0pWP_AEE6osUlXHcgGvf8mPSCl4HqTsVdk',
  'PROMPTR_PREMIUM_puvmqOt9klT1stGJOQQN45jRxm4s8k8B3i8EODePuAE',
  'PROMPTR_PREMIUM_EdixgkYlXYAxVIkH7UyGsk5Gy0OC6PepxpPYIM1mC9g',
  'PROMPTR_PREMIUM_rfHt_MgtPwJyXi9aaGtH2a7_y8qu-8akXKsC2ZxX37Q',
  'PROMPTR_PREMIUM_yLzVvQJFzkFM8oWsB5TTx1q7gvJeIc-OGup9uYk9E7k'
]);

/**
 * Validates a Promptr access token against the backend
 */
export async function validateAccessToken(token: string): Promise<TokenValidationResponse> {
  // Check for valid premium bypass tokens first (permanent tokens)
  if (VALID_PREMIUM_TOKENS.has(token)) {
    console.log('✅ Valid permanent premium token detected, granting unlimited access');
    return {
      access: true,
      status: 'pro',
      user_email: 'premium-user@promptr.com',
      message: 'Premium token validated successfully'
    };
  }
  
  // Check for time-limited premium tokens
  if (TOKEN_EXPIRATION[token]) {
    const expiryDate = new Date(TOKEN_EXPIRATION[token]);
    const now = new Date();
    
    if (now > expiryDate) {
      console.log('❌ Time-limited token expired on', TOKEN_EXPIRATION[token]);
      return {
        access: false,
        status: 'inactive',
        message: `Token expired on ${TOKEN_EXPIRATION[token]}. Please get a new token from usepromptr.com/account`
      };
    }
    
    console.log('✅ Valid time-limited premium token detected, expires on', TOKEN_EXPIRATION[token]);
    return {
      access: true,
      status: 'pro',
      user_email: 'premium-user@promptr.com',
      message: `Premium token validated successfully. Expires on ${TOKEN_EXPIRATION[token]}`
    };
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      access: false,
      message: 'Supabase configuration missing'
    };
  }
  
  const endpoint = `${supabaseUrl}/functions/v1/validate-token`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Promptr API Error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    console.log('Promptr token-check response:', json);
    
    // Handle validate-token response format
    if (json.access) {
      // For free plan users, we want to show them as 'active' but with usage limits
      const status = json.status === 'trialing' ? 'active' : json.status;
      return {
        access: true,
        status: status,
        user_email: json.email || 'user@example.com',
        message: 'Token validated successfully'
      };
    } else {
      return {
        access: false,
        status: json.status || 'inactive',
        message: json.message || 'Invalid token'
      };
    }
  } catch (error: any) {
    console.error('Token validation failed:', error);
    return {
      access: false,
      message: `Validation error: ${error.message}`
    };
  }
}

/**
 * Check if user has valid Promptr access using stored or entered token
 */
export async function checkUserAccess(): Promise<boolean> {
  // First check if they have a token stored
  let token = await getStoredToken();
  
  if (!token) {
    // Show input box for token
    const inputToken = await vscode.window.showInputBox({
      prompt: 'Enter your Promptr access token',
      placeHolder: 'Get your token from https://usepromptr.com/account',
      password: true,
      ignoreFocusOut: true
    });
    
    if (!inputToken) {
      vscode.window.showErrorMessage('Please enter your Promptr access token to continue.');
      return false;
    }
    
    // Store the token for future use
    await storeToken(inputToken);
    token = inputToken;
  }

  // Validate the token
  if (!token) {
    return false;
  }
  
  const result = await validateAccessToken(token);
  
      console.log(`🔍 Token validation result: access=${result.access}, status=${result.status || 'unknown'}, message=${result.message || 'no message'}`);
  
  if (result.access) {
    console.log(`✅ Promptr access granted for ${result.user_email} (${result.status})`);
    
    // Show success message for first-time setup or status changes
    const lastStatus = await getLastKnownStatus();
    if (!lastStatus || lastStatus !== result.status) {
      vscode.window.showInformationMessage(
        `✨ Promptr ${result.status} subscription verified for ${result.user_email}`
      );
      await storeLastKnownStatus(result.status || 'unknown');
    }
    
    return true;
  } else {
    console.log(`❌ Promptr access denied: ${result.message}`);
    
    // Clear stored token if invalid
    await clearStoredToken();
    
    if (result.status === 'inactive') {
      const action = await vscode.window.showErrorMessage(
        'Your Promptr subscription is inactive. Please update your payment method to continue using the service.',
        'Open Billing',
        'Enter New Token'
      );
      
      if (action === 'Open Billing') {
        vscode.env.openExternal(vscode.Uri.parse('https://usepromptr.com/account'));
      } else if (action === 'Enter New Token') {
        return await checkUserAccess(); // Recursive call to re-enter token
      }
    } else {
      const action = await vscode.window.showErrorMessage(
        'Invalid access token. Please check your token and try again. You can get a valid token from usepromptr.com/account',
        'Enter New Token',
        'Get Token'
      );
      
      if (action === 'Enter New Token') {
        return await checkUserAccess(); // Recursive call to re-enter token
      } else if (action === 'Get Token') {
        vscode.env.openExternal(vscode.Uri.parse('https://usepromptr.com/account'));
      }
    }
    
    return false;
  }
}

/**
 * Manual token entry command
 */
export async function enterAccessTokenCommand(): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt: 'Enter your Promptr access token',
    placeHolder: 'Get your token from https://usepromptr.com/account',
    password: true,
    ignoreFocusOut: true
  });
  
  if (!token) {
    return;
  }
  
  // Validate the token immediately
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Validating Promptr token...",
    cancellable: false
  }, async () => {
    const result = await validateAccessToken(token);
    
    if (result.access) {
      await storeToken(token);
      await storeLastKnownStatus(result.status || 'unknown');
      vscode.window.showInformationMessage(
        `✅ Promptr token validated! Welcome ${result.user_email} (${result.status})`
      );
      
      // Trigger plan status refresh
      vscode.commands.executeCommand('promptr.refreshStatus');
    } else {
      vscode.window.showErrorMessage(
        'Invalid access token. Please check your token and try again. You can get a valid token from usepromptr.com/account'
      );
    }
  });
}

// Extension context storage
let extensionContext: vscode.ExtensionContext | undefined;

export function setExtensionContext(context: vscode.ExtensionContext) {
  extensionContext = context;
  console.log('[DEBUG] setExtensionContext called, context set:', !!context);
}

function getExtensionContext(): vscode.ExtensionContext | undefined {
  return extensionContext;
}

/**
 * Store token securely in VS Code's secret storage
 */
async function storeToken(token: string): Promise<void> {
  const context = getExtensionContext();
  if (context) {
    await context.secrets.store('promptr.accessToken', token);
  }
}

/**
 * Get stored token from VS Code's secret storage
 */
export async function getStoredToken(): Promise<string | undefined> {
  const context = getExtensionContext();
  if (context) {
    const token = await context.secrets.get('promptr.accessToken');
    console.log('[DEBUG] getStoredToken called, token:', token);
    return token;
  }
  console.log('[DEBUG] getStoredToken called, but context is undefined');
  return undefined;
}

/**
 * Clear stored token
 */
async function clearStoredToken(): Promise<void> {
  const context = getExtensionContext();
  if (context) {
    await context.secrets.delete('promptr.accessToken');
  }
}

/**
 * Store last known subscription status
 */
async function storeLastKnownStatus(status: string): Promise<void> {
  const context = getExtensionContext();
  if (context) {
    await context.globalState.update('promptr.lastStatus', status);
  }
}

/**
 * Get last known subscription status
 */
async function getLastKnownStatus(): Promise<string | undefined> {
  const context = getExtensionContext();
  if (context) {
    return context.globalState.get('promptr.lastStatus');
  }
  return undefined;
} 