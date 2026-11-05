# Task-it no celular — como gerar e publicar

A pasta `celular/` é o app de celular (Android e iPhone), feito com Capacitor.
O conteúdo do app vem de `mobile/index.html` + `shared/` (os mesmos arquivos que o PC usa).

Sempre que mudar algo em `mobile/` ou `shared/`, rode dentro de `celular/`:

```bash
npm run sync
```

---

## Android (APK)

APK de teste (instala direto no celular):

```bash
npm run apk
```

O arquivo sai em `celular/android/app/build/outputs/apk/debug/app-debug.apk`.
Para instalar: mande o arquivo para o celular e abra; o Android vai pedir para
permitir "instalar apps desconhecidos".

### Para colocar na Google Play
1. Crie uma conta de desenvolvedor no Google Play Console (taxa única de US$ 25).
2. Gere uma chave de assinatura e um **AAB** de release (`gradlew bundleRelease`) —
   peça que eu configure isso quando chegar a hora.
3. Crie o app no Play Console, envie o AAB, preencha a ficha (ícone, prints, descrição,
   política de privacidade) e mande para revisão.

---

## iPhone (App Store)

A Apple só permite compilar e enviar apps iOS a partir de um **Mac com Xcode**.
Você vai precisar de:

- Um Mac (pode ser emprestado ou um Mac alugado na nuvem, como MacinCloud).
- **Xcode** (grátis na Mac App Store).
- **Conta Apple Developer** (US$ 99/ano): https://developer.apple.com/programs/
- Node.js instalado no Mac: https://nodejs.org

### Passo a passo no Mac
1. Copie a pasta inteira do projeto para o Mac.
2. No Terminal, dentro da pasta do projeto:
   ```bash
   npm install
   ```
3. Dentro de `celular/`:
   ```bash
   npm install
   npm run sync
   npx cap open ios
   ```
   Isso abre o projeto no Xcode.
4. No Xcode, clique em **App** (barra lateral) → aba **Signing & Capabilities**:
   - Marque **Automatically manage signing**.
   - Em **Team**, escolha a sua conta Apple Developer.
   - Em **Bundle Identifier**, use um nome único seu (ex.: `com.seunome.taskit`).
     Se mudar aqui, mude também o `appId` em `celular/capacitor.config.json`.
5. Ícone: em **App → Assets → AppIcon**, arraste um ícone 1024×1024.
6. Teste: ligue o iPhone no cabo, escolha ele no topo do Xcode e aperte ▶.
7. Enviar: menu **Product → Archive**. Quando terminar, clique em
   **Distribute App → App Store Connect → Upload**.
8. Em https://appstoreconnect.apple.com:
   - **Meus Apps → +** → novo app com o mesmo Bundle Identifier.
   - Preencha nome, descrição, prints (tirados do simulador do Xcode), categoria
     (Produtividade) e um link de **política de privacidade** (obrigatório).
   - Escolha o build enviado e clique em **Enviar para revisão**.

### Pontos de atenção na revisão da Apple
- **Política de privacidade:** diga que as notas ficam no aparelho e são enviadas
  direto (P2P, criptografado) para o computador pareado; o servidor público do
  PeerJS só é usado para os dois aparelhos se encontrarem.
- A Apple às vezes recusa apps que parecem "só um site dentro de um app"
  (diretriz 4.2). O Task-it funciona offline e guarda as notas no aparelho, o que
  ajuda; se recusarem, dá para adicionar recursos nativos (notificações, widget).

### Sem Mac?
Serviços como **Codemagic** ou **Ionic Appflow** compilam iOS na nuvem a partir do
projeto. Ainda é preciso a conta Apple Developer e configurar os certificados lá.
