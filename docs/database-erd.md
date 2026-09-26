# WeTalk 数据库 ER 图

本图根据 backend/sql/001-schema.sql 的 9 张空表结构整理，并用 mapper 查询核对业务关联。SQL 没有声明数据库外键；图中的连线表示应用层逻辑关系，不代表 MySQL 会自动校验或级联删除。

~~~mermaid
erDiagram
  USER_INFO {
    varchar user_id PK
    varchar email UK
    varchar nick_name
    varchar password
    varchar personal_signature
    tinyint join_type
    tinyint sex
    tinyint status
    datetime create_time
    datetime last_login_time
    varchar area_name
    varchar area_code
    bigint last_off_time
    tinyint is_delete
  }

  GROUP_INFO {
    varchar group_id PK
    varchar group_name
    varchar group_own_id
    datetime create_time
    varchar group_notice
    tinyint join_type
    tinyint status
  }

  USER_CONTACT {
    varchar user_id PK
    varchar contact_id PK
    tinyint contact_type
    datetime create_time
    tinyint status
    datetime update_time
  }

  USER_CONTACT_APPLY {
    int apply_id PK
    varchar apply_user_id
    varchar receive_user_id
    tinyint contact_type
    varchar contact_id
    bigint last_apply_time
    tinyint status
    varchar apply_info
  }

  USER_INFO_BEAUTY {
    int id PK
    varchar email UK
    varchar user_id UK
    tinyint status
  }

  CHAT_SESSION {
    varchar session_id PK
    varchar last_message
    bigint last_receive_time
  }

  CHAT_SESSION_USER {
    varchar user_id PK
    varchar contact_id PK
    varchar session_id
    varchar contact_name
  }

  CHAT_MESSAGE {
    int message_id PK
    varchar session_id
    tinyint message_type
    varchar message_content
    varchar send_user_id
    varchar send_user_nick_name
    bigint send_time
    varchar contact_id
    tinyint contact_type
    bigint file_size
    varchar file_name
    tinyint file_type
    tinyint status
  }

  APP_UPDATE {
    int id PK
    varchar version
    varchar update_desc
    datetime create_time
    tinyint status
    varchar grayscale_uid
    tinyint file_type
    varchar outer_link
  }

  USER_INFO ||--o{ GROUP_INFO : owns_by_group_own_id
  USER_INFO ||--o{ USER_CONTACT : user_id
  USER_INFO ||--o{ USER_CONTACT_APPLY : apply_user_id
  USER_INFO ||--o{ USER_CONTACT_APPLY : receive_user_id
  USER_INFO ||--o{ CHAT_SESSION_USER : user_id
  CHAT_SESSION ||--o{ CHAT_SESSION_USER : session_id
  CHAT_SESSION ||--o{ CHAT_MESSAGE : session_id
  USER_INFO o|--o{ CHAT_MESSAGE : send_user_id
  USER_INFO o|--o| USER_INFO_BEAUTY : user_id
~~~

## 多态联系人字段

以下 contact_id 字段可以指向用户，也可以指向群，实际目标由 contact_type 区分；它们不是单一外键，图中没有画成固定实体关系：

- user_contact.contact_id：contact_type 为 0 时是 user_info.user_id；为 1 时是 group_info.group_id。
- user_contact_apply.contact_id：申请目标，contact_type 区分好友或群。
- chat_session_user.contact_id：会话对应的用户或群。
- chat_message.contact_id：消息联系人；contact_type 为 0 表示单聊，1 表示群聊。

## 主要关系说明

- 一个用户可以拥有多个群；group_info.group_own_id 记录群主。
- user_contact 保存用户的好友关系或群成员关系。好友关系通常以两条有方向的用户记录表示；群成员以 user_id + 群 contact_id 记录。
- user_contact_apply 保存好友/入群申请。接收人是用户；群申请的 contact_id 指向 group_info.group_id。
- chat_session_user 把用户和联系人/群映射到会话；同一群会话对应多个成员映射。
- chat_message 通过 session_id 归入会话；群系统消息和普通文本消息共用这张表。
- user_info_beauty 管理预留靓号；user_id 在表内唯一，但 SQL 未声明它引用 user_info 的外键。
- app_update 是客户端版本发布记录，不与聊天主数据建立关系。

## 主键与索引提示

| 表 | 主键/唯一约束 |
|---|---|
| user_info | user_id；email 唯一 |
| group_info | group_id |
| user_contact | user_id + contact_id |
| user_contact_apply | apply_id；申请人、接收人和联系人组合唯一 |
| user_info_beauty | id；email 和 user_id 唯一 |
| chat_session | session_id |
| chat_session_user | user_id + contact_id |
| chat_message | message_id；session_id、发送人、联系人和发送时间有索引 |
| app_update | id |

修改表结构前应以 backend/sql/001-schema.sql 和 mapper 查询为准；初始化 SQL 仅供空数据库使用，不是生产数据库升级脚本。
