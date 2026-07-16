# Grupos e mensagens interativas

## Permissões

O WhatsApp exige que a conta conectada seja administradora para diversas operações, como remover participantes, promover administradores, alterar configurações e renovar convites. Quando a permissão não existir, o provider retornará erro.

## Menção de todos

O Zapinho obtém os participantes diretamente dos metadados atuais do grupo. O envio inclui a lista de JIDs no contexto da mensagem e, por padrão, acrescenta as marcações visíveis ao final do texto.

Controles:

- `GROUP_MENTION_MAX_PARTICIPANTS` limita o total por mensagem.
- `includeAdmins=false` exclui administradores.
- `appendMentions=false` não adiciona os nomes visíveis, embora envie o contexto de menção.
- `mentionAll=false` permite informar a lista em `mentions`.

Use esse recurso somente em grupos nos quais as pessoas esperam receber a comunicação.

## Botões e listas

O provider Baileys envia botões e listas por mensagens native-flow. Como esse formato depende do WhatsApp Web, ele é declarado como `experimental`.

A aplicação consumidora deve sempre possuir fallback em texto. Exemplo:

```txt
1 - Confirmar
2 - Cancelar
```

Caso os botões não apareçam em uma versão específica do WhatsApp, o usuário ainda poderá responder pelo texto.

## Eventos

Cliques em botões, listas e templates são normalizados como `message.interaction`. O payload original continua disponível em `raw` para depuração.
